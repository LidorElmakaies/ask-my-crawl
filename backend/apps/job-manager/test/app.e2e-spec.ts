import { randomUUID } from 'crypto';
import type { INestMicroservice } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { StartedKafkaContainer } from '@testcontainers/kafka';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Kafka, logLevel, type Producer } from 'kafkajs';
import type { Repository } from 'typeorm';
import {
  createKafkaTopics,
  startKafkaTestContainer,
  startPostgresTestContainer,
} from '@app/testing';
import {
  KAFKA_TOPICS,
  type AnswerReadyMessage,
  type CrawlFrontierMessage,
  type JobCreatedMessage,
  type JobRequestsMessage,
  type ResultSavedMessage,
} from '@app/kafka-contracts';
import { JobEntity } from '../src/infrastructure/postgres/entities/job.entity';
import { JobManagerModule } from '../src/job-manager.module';

// Starting Postgres + Kafka containers, creating topics, and waiting on async Kafka round-trips
// takes far longer than Jest's default 5s (and this suite's own jest-e2e.config.js's 60s).
jest.setTimeout(180000);

/** Collects every message currently retained on a topic within a fixed window, via a fresh,
 * uniquely-grouped consumer reading from the beginning — used instead of "wait for first match"
 * so we can assert *exactly one* matching message rather than just "at least one". */
async function collectTopicMessages<T>(
  brokers: string[],
  topic: string,
  windowMs = 8000,
): Promise<{ key: string | null; value: T }[]> {
  const kafka = new Kafka({
    clientId: `verify-${topic}`,
    brokers,
    logLevel: logLevel.NOTHING,
  });
  const consumer = kafka.consumer({
    groupId: `verify-${topic}-${randomUUID()}`,
  });
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: true });

  const messages: { key: string | null; value: T }[] = [];
  await consumer.run({
    eachMessage: ({ message }) => {
      messages.push({
        key: message.key ? message.key.toString() : null,
        value: message.value
          ? (JSON.parse(message.value.toString()) as T)
          : (null as unknown as T),
      });
      return Promise.resolve();
    },
  });

  await new Promise((resolve) => setTimeout(resolve, windowMs));
  await consumer.disconnect();
  return messages;
}

async function waitForJobRow(
  repo: Repository<JobEntity>,
  where: Partial<JobEntity>,
  timeoutMs = 30000,
): Promise<JobEntity | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const row = await repo.findOneBy(where);
    if (row) return row;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}

describe('Job Manager Service (e2e)', () => {
  let pgContainer: StartedPostgreSqlContainer;
  let kafkaContainer: StartedKafkaContainer;
  let brokers: string[];
  let app: INestMicroservice;
  let jobRepo: Repository<JobEntity>;
  let producer: Producer;

  beforeAll(async () => {
    pgContainer = await startPostgresTestContainer();
    const startedKafka = await startKafkaTestContainer();
    kafkaContainer = startedKafka.container;
    brokers = startedKafka.brokers;

    // auto.create.topics.enable=false is this project's Kafka convention — mirrors what
    // devops/kafka/docker-compose.yml's kafka-init service does for the real deployment.
    await createKafkaTopics(brokers, [
      KAFKA_TOPICS.JOB_REQUESTS,
      KAFKA_TOPICS.CRAWL_FRONTIER,
      KAFKA_TOPICS.JOB_CREATED,
      KAFKA_TOPICS.ANSWER_READY,
      KAFKA_TOPICS.RESULT_SAVED,
    ]);

    process.env.DATABASE_URL = pgContainer.getConnectionUri();
    process.env.KAFKA_BROKERS = brokers.join(',');
    process.env.NODE_ENV = 'test'; // not 'production' — TypeORM synchronize stays on

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [JobManagerModule],
    }).compile();

    app = moduleFixture.createNestMicroservice<MicroserviceOptions>({
      transport: Transport.KAFKA,
      options: {
        client: { clientId: 'job-manager-e2e', brokers },
        consumer: { groupId: 'job-manager' },
      },
    });
    await app.listen();

    jobRepo = moduleFixture.get<Repository<JobEntity>>(
      getRepositoryToken(JobEntity),
    );

    const kafka = new Kafka({
      clientId: 'test-producer',
      brokers,
      logLevel: logLevel.NOTHING,
    });
    producer = kafka.producer();
    await producer.connect();

    // The freshly-started KRaft broker reports "started" (testcontainers wait strategy) slightly
    // before its group-coordinator protocol is fully settled — the ServerKafka consumer's first
    // group-join can otherwise race that and silently miss the very first published message (seen
    // as a "GroupCoordinator ... not available" broker log during this window). A short grace
    // period here is cheaper and more deterministic than retrying the first scenario.
    await new Promise((resolve) => setTimeout(resolve, 5000));
  });

  afterAll(async () => {
    await producer.disconnect();
    await app.close();
    await kafkaContainer.stop();
    await pgContainer.stop();
  });

  describe('job-requests -> jobs row + crawl-frontier seed + job-created', () => {
    it('creates exactly one row and publishes exactly one crawl-frontier and one job-created message', async () => {
      const message: JobRequestsMessage = {
        user_id: randomUUID(),
        url: `https://example.com/${randomUUID()}`,
        query: 'what is this page about?',
        depth: 5,
      };

      await producer.send({
        topic: KAFKA_TOPICS.JOB_REQUESTS,
        messages: [{ key: message.user_id, value: JSON.stringify(message) }],
      });

      const row = await waitForJobRow(jobRepo, {
        user_id: message.user_id,
        url: message.url,
      });
      expect(row).not.toBeNull();
      expect(row).toMatchObject({
        user_id: message.user_id,
        url: message.url,
        query: message.query,
        result: null,
      });
      const jobId = row!.id;

      const crawlFrontierMessages = (
        await collectTopicMessages<CrawlFrontierMessage>(
          brokers,
          KAFKA_TOPICS.CRAWL_FRONTIER,
        )
      ).filter((m) => m.value.job_id === jobId);
      expect(crawlFrontierMessages).toHaveLength(1);
      expect(crawlFrontierMessages[0].value).toEqual({
        job_id: jobId,
        user_id: message.user_id,
        url: message.url,
        depth: message.depth,
        query: message.query,
      });
      // Kafka contract conformance: exact key set matches CrawlFrontierMessage.
      expect(Object.keys(crawlFrontierMessages[0].value).sort()).toEqual(
        ['depth', 'job_id', 'query', 'url', 'user_id'].sort(),
      );

      const jobCreatedMessages = (
        await collectTopicMessages<JobCreatedMessage>(
          brokers,
          KAFKA_TOPICS.JOB_CREATED,
        )
      ).filter((m) => m.value.job_id === jobId);
      expect(jobCreatedMessages).toHaveLength(1);
      expect(jobCreatedMessages[0].key).toBe(jobId);
      expect(jobCreatedMessages[0].value).toEqual({
        job_id: jobId,
        user_id: message.user_id,
        url: message.url,
        query: message.query,
      });
      // Kafka contract conformance: exact key set matches JobCreatedMessage.
      expect(Object.keys(jobCreatedMessages[0].value).sort()).toEqual(
        ['job_id', 'query', 'url', 'user_id'].sort(),
      );
    });
  });

  describe('answer-ready -> jobs.result + result-saved', () => {
    it('updates the row and publishes exactly one result-saved message with the exact payload', async () => {
      const seed: JobRequestsMessage = {
        user_id: randomUUID(),
        url: `https://example.com/${randomUUID()}`,
        query: 'another question',
        depth: 5,
      };
      await producer.send({
        topic: KAFKA_TOPICS.JOB_REQUESTS,
        messages: [{ key: seed.user_id, value: JSON.stringify(seed) }],
      });
      const row = await waitForJobRow(jobRepo, {
        user_id: seed.user_id,
        url: seed.url,
      });
      expect(row).not.toBeNull();
      const jobId = row!.id;

      const answerReady: AnswerReadyMessage = {
        job_id: jobId,
        user_id: seed.user_id,
        answer_text: 'The answer, per the crawled page, is 42.',
        failed_reason: null,
      };
      await producer.send({
        topic: KAFKA_TOPICS.ANSWER_READY,
        messages: [{ key: jobId, value: JSON.stringify(answerReady) }],
      });

      // Poll for the Postgres update rather than a fixed sleep.
      const start = Date.now();
      let updatedRow: JobEntity | null = null;
      while (Date.now() - start < 15000) {
        updatedRow = await jobRepo.findOneBy({ id: jobId });
        if (updatedRow?.result) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      expect(updatedRow?.result).toBe(answerReady.answer_text);

      const resultSavedMessages = (
        await collectTopicMessages<ResultSavedMessage>(
          brokers,
          KAFKA_TOPICS.RESULT_SAVED,
        )
      ).filter((m) => m.value.job_id === jobId);
      expect(resultSavedMessages).toHaveLength(1);
      expect(resultSavedMessages[0].key).toBe(seed.user_id);
      expect(resultSavedMessages[0].value).toEqual({
        job_id: jobId,
        user_id: seed.user_id,
        result: answerReady.answer_text,
        failed_reason: null,
      });
      // Kafka contract conformance: exact key set matches ResultSavedMessage.
      expect(Object.keys(resultSavedMessages[0].value).sort()).toEqual(
        ['failed_reason', 'job_id', 'result', 'user_id'].sort(),
      );
    });
  });

  describe('answer-ready referencing an unknown job_id', () => {
    it('publishes no result-saved message and creates no row', async () => {
      const unknownJobId = randomUUID();
      const rowCountBefore = await jobRepo.count();

      const answerReady: AnswerReadyMessage = {
        job_id: unknownJobId,
        user_id: randomUUID(),
        answer_text: 'orphaned answer',
        failed_reason: null,
      };
      await producer.send({
        topic: KAFKA_TOPICS.ANSWER_READY,
        messages: [{ key: unknownJobId, value: JSON.stringify(answerReady) }],
      });

      const resultSavedMessages = (
        await collectTopicMessages<ResultSavedMessage>(
          brokers,
          KAFKA_TOPICS.RESULT_SAVED,
        )
      ).filter((m) => m.value.job_id === unknownJobId);
      expect(resultSavedMessages).toHaveLength(0);

      const rowCountAfter = await jobRepo.count();
      expect(rowCountAfter).toBe(rowCountBefore);
      const row = await jobRepo.findOneBy({ id: unknownJobId });
      expect(row).toBeNull();
    });
  });
});

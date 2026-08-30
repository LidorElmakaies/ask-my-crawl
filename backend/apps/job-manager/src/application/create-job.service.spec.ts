/* eslint-disable @typescript-eslint/unbound-method --
   false positive: these are jest.fn() mocks, not real prototype methods relying on `this`. */
import { createHash } from 'crypto';
import {
  KAFKA_TOPICS,
  MAX_CRAWL_DEPTH,
  type JobRequestsMessage,
} from '@app/kafka-contracts';
import type { IEventPublisher } from '@app/kafka-client';
import type { IJobRepository } from '../infrastructure/interfaces/job-repository.interface';
import type { Job } from '../models/job';
import { CreateJobService } from './create-job.service';

function makeDeps() {
  const jobRepository: jest.Mocked<IJobRepository> = {
    create: jest.fn(),
    saveResult: jest.fn(),
  };
  const eventPublisher: jest.Mocked<IEventPublisher> = {
    publish: jest.fn(),
  };
  return { jobRepository, eventPublisher };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    user_id: 'user-1',
    url: 'https://example.com/page',
    query: 'what is this page about?',
    result: null,
    ...overrides,
  };
}

describe('CreateJobService', () => {
  const input: JobRequestsMessage = {
    user_id: 'user-1',
    url: 'https://example.com/page',
    query: 'what is this page about?',
  };

  it('creates the job row with exactly {user_id, url, query}', async () => {
    const { jobRepository, eventPublisher } = makeDeps();
    jobRepository.create.mockResolvedValue(makeJob());

    const service = new CreateJobService(jobRepository, eventPublisher);
    await service.handle(input);

    expect(jobRepository.create).toHaveBeenCalledTimes(1);
    expect(jobRepository.create).toHaveBeenCalledWith({
      user_id: 'user-1',
      url: 'https://example.com/page',
      query: 'what is this page about?',
    });
  });

  it('publishes crawl-frontier with the exact seed payload, keyed by sha256(url)', async () => {
    const { jobRepository, eventPublisher } = makeDeps();
    const job = makeJob();
    jobRepository.create.mockResolvedValue(job);

    const service = new CreateJobService(jobRepository, eventPublisher);
    await service.handle(input);

    const expectedKey = createHash('sha256').update(job.url).digest('hex');
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      KAFKA_TOPICS.CRAWL_FRONTIER,
      expectedKey,
      {
        job_id: job.id,
        user_id: job.user_id,
        url: job.url,
        depth: MAX_CRAWL_DEPTH,
        query: job.query,
        base_url: job.url,
      },
    );
  });

  it('publishes job-created with the exact payload, keyed by job_id', async () => {
    const { jobRepository, eventPublisher } = makeDeps();
    const job = makeJob();
    jobRepository.create.mockResolvedValue(job);

    const service = new CreateJobService(jobRepository, eventPublisher);
    await service.handle(input);

    expect(eventPublisher.publish).toHaveBeenCalledWith(
      KAFKA_TOPICS.JOB_CREATED,
      job.id,
      {
        job_id: job.id,
        user_id: job.user_id,
        url: job.url,
        query: job.query,
      },
    );
  });

  it('publishes crawl-frontier before job-created', async () => {
    const { jobRepository, eventPublisher } = makeDeps();
    jobRepository.create.mockResolvedValue(makeJob());

    const service = new CreateJobService(jobRepository, eventPublisher);
    await service.handle(input);

    expect(eventPublisher.publish).toHaveBeenCalledTimes(2);
    const [firstTopic] = eventPublisher.publish.mock.calls[0];
    const [secondTopic] = eventPublisher.publish.mock.calls[1];
    expect(firstTopic).toBe(KAFKA_TOPICS.CRAWL_FRONTIER);
    expect(secondTopic).toBe(KAFKA_TOPICS.JOB_CREATED);
  });
});

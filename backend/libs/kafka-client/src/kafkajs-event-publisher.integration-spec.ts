import type { ConfigService } from '@nestjs/config';
import { Kafka, logLevel } from 'kafkajs';
import { createKafkaTopics, startKafkaTestContainer } from '@app/testing';
import type { StartedKafkaContainer } from '@testcontainers/kafka';
import { KafkajsEventPublisher } from './kafkajs-event-publisher';

const TOPIC = 'test-topic';

function fakeConfig(brokers: string[]): ConfigService {
  return {
    get: (key: string) =>
      key === 'KAFKA_BROKERS' ? brokers.join(',') : undefined,
  } as unknown as ConfigService;
}

// Infrastructure-integration tier — real Kafka via testcontainers, no mocking. See
// jest-integration.config.js. Run via `npm run test:integration` (requires Docker). Moved here
// from job-manager's own infra folder when KafkajsEventPublisher itself moved to this shared lib —
// the class under test is now shared, so its integration coverage lives alongside it rather than
// under whichever service happened to write the test first.
describe('KafkajsEventPublisher (integration)', () => {
  let container: StartedKafkaContainer;
  let brokers: string[];
  let publisher: KafkajsEventPublisher;

  beforeAll(async () => {
    const started = await startKafkaTestContainer();
    container = started.container;
    brokers = started.brokers;
    await createKafkaTopics(brokers, [TOPIC]);

    publisher = new KafkajsEventPublisher(fakeConfig(brokers), 'test-client');
    await publisher.onModuleInit();
  });

  afterAll(async () => {
    await publisher.onModuleDestroy();
    await container.stop();
  });

  it('produces a message to the given topic with the given key/value, readable by a raw kafkajs consumer', async () => {
    const kafka = new Kafka({
      clientId: 'test-consumer',
      brokers,
      logLevel: logLevel.NOTHING,
    });
    const consumer = kafka.consumer({ groupId: `verify-${Date.now()}` });
    await consumer.connect();
    await consumer.subscribe({ topic: TOPIC, fromBeginning: true });

    const received: { key: string | null; value: unknown }[] = [];
    await consumer.run({
      eachMessage: ({ message }) => {
        received.push({
          key: message.key ? message.key.toString() : null,
          value: message.value
            ? (JSON.parse(message.value.toString()) as unknown)
            : null,
        });
        return Promise.resolve();
      },
    });

    // Give the consumer group time to join before producing — otherwise the message could be
    // sent before the consumer has a partition assignment.
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await publisher.publish(TOPIC, 'my-key', { hello: 'world' });

    const start = Date.now();
    while (received.length === 0 && Date.now() - start < 20000) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await consumer.disconnect();

    expect(received).toEqual([{ key: 'my-key', value: { hello: 'world' } }]);
  }, 30000);
});

// Shared testcontainers-Kafka bootstrap for Infrastructure-integration and E2E tests. Job Manager
// Service is the first app needing a real Kafka broker in tests, so this is written straight into
// the shared lib rather than hand-rolled first and extracted later.
import { KafkaContainer, StartedKafkaContainer } from '@testcontainers/kafka';
import { Kafka } from 'kafkajs';

// KRaft mode (no Zookeeper) to match the real broker (devops/kafka/docker-compose.yml).
export const KAFKA_TEST_IMAGE = 'confluentinc/cp-kafka:7.5.0';

export interface StartedTestKafka {
  container: StartedKafkaContainer;
  /** Bootstrap broker address(es), ready to hand to a kafkajs `Kafka({ brokers })` client. */
  brokers: string[];
}

// @testcontainers/kafka exposes the plaintext listener on container port 9093 (see its
// kafka-container.js — KAFKA_PORT constant); getMappedPort resolves the host-side port Docker
// bound it to.
const KAFKA_PLAINTEXT_PORT = 9093;

export async function startKafkaTestContainer(): Promise<StartedTestKafka> {
  const container = await new KafkaContainer(KAFKA_TEST_IMAGE)
    .withKraft()
    .start();
  const brokers = [
    `${container.getHost()}:${container.getMappedPort(KAFKA_PLAINTEXT_PORT)}`,
  ];
  return { container, brokers };
}

/**
 * Creates topics via a raw kafkajs admin client — mirrors what devops/kafka/docker-compose.yml's
 * `kafka-init` service does for the real deployment, since `auto.create.topics.enable=false` is
 * this project's Kafka convention (nothing auto-creates a topic on first produce/consume).
 */
export async function createKafkaTopics(
  brokers: string[],
  topics: string[],
): Promise<void> {
  const kafka = new Kafka({ clientId: 'test-topic-admin', brokers });
  const admin = kafka.admin();
  await admin.connect();
  try {
    await admin.createTopics({
      topics: topics.map((topic) => ({ topic, numPartitions: 1 })),
      waitForLeaders: true,
    });
  } finally {
    await admin.disconnect();
  }
}

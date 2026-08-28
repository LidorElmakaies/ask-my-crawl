import type { CrawlFrontierMessage } from '@app/kafka-contracts';

/**
 * Implemented by BullMqProcessUrlQueue. Consumed by FrontierIntakeService — enqueuing onto BullMQ
 * is an outbound side effect (Infrastructure), same rule as a Kafka producer. See
 * docs/specs/backend-architecture.md's BullMQ rule. Reuses CrawlFrontierMessage's shape directly
 * rather than inventing a parallel type — process-url job data is exactly a crawl-frontier
 * message's fields.
 */
export interface IProcessUrlQueue {
  enqueue(data: CrawlFrontierMessage): Promise<void>;
}

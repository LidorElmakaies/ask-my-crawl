import type { PageScrapedMessage } from '@app/kafka-contracts';

/**
 * Implemented by BullMqIndexPageQueue. Consumed by IndexIntakeService — enqueuing onto BullMQ is
 * an outbound side effect (Infrastructure), same rule as a Kafka producer. See
 * docs/specs/backend-architecture.md's BullMQ rule. Reuses PageScrapedMessage's shape directly
 * rather than inventing a parallel type — index-page job data is exactly a page-scraped message's
 * fields, same pattern as the Scraper's IProcessUrlQueue reusing CrawlFrontierMessage.
 */
export interface IIndexPageQueue {
  enqueue(data: PageScrapedMessage): Promise<void>;
}

import type { CrawlFrontierMessage } from '@app/kafka-contracts';

/**
 * Implemented by FrontierIntakeService. Consumed by the API layer (FrontierConsumer).
 */
export interface IFrontierIntakeUseCase {
  handle(message: CrawlFrontierMessage): Promise<void>;
}

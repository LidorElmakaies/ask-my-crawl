import type { CrawlFrontierMessage } from '@app/kafka-contracts';

/** Implemented by FrontierIntakeService. Consumed by FrontierConsumer. */
export interface IFrontierIntakeUseCase {
  handle(message: CrawlFrontierMessage): Promise<void>;
}

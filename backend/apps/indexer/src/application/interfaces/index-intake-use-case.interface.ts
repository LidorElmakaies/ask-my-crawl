import type { PageScrapedMessage } from '@app/kafka-contracts';

/**
 * Implemented by IndexIntakeService. Consumed by the API layer (IndexIntakeConsumer). Mirrors the
 * Scraper's FrontierIntakeService/IFrontierIntakeUseCase shape, minus the dedup gate — see
 * index-intake.service.ts's doc comment for why none is needed here.
 */
export interface IIndexIntakeUseCase {
  handle(message: PageScrapedMessage): Promise<void>;
}

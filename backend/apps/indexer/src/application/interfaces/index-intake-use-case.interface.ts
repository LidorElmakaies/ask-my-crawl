import type { PageScrapedMessage } from '@app/kafka-contracts';

/** Implemented by IndexIntakeService. Consumed by IndexIntakeConsumer. */
export interface IIndexIntakeUseCase {
  handle(message: PageScrapedMessage): Promise<void>;
}

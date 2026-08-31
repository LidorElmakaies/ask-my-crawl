import type { PageScrapedMessage } from '@app/kafka-contracts';

/** Implemented by BullMqIndexPageQueue. Consumed by IndexIntakeService. */
export interface IIndexPageQueue {
  enqueue(data: PageScrapedMessage): Promise<void>;
}

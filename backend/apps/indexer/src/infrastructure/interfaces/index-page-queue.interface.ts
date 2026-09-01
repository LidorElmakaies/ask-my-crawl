import type { PageScrapedMessage } from '@app/kafka-contracts';

/** Implemented by BullMqIndexPageQueue. Consumed by IndexIntakeService. */
export interface IIndexPageQueue {
  alreadyClaimed(jobId: string, normalizedUrl: string): Promise<boolean>;

  enqueue(data: PageScrapedMessage): Promise<void>;
}

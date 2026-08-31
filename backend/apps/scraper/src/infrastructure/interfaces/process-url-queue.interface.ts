import type { CrawlFrontierMessage } from '@app/kafka-contracts';

/** Implemented by BullMqProcessUrlQueue. Consumed by FrontierIntakeService. */
export interface IProcessUrlQueue {
  enqueue(data: CrawlFrontierMessage): Promise<void>;
}

import type { CrawlFrontierMessage } from '@app/kafka-contracts';

/** Implemented by BullMqProcessUrlQueue. Consumed by FrontierIntakeService. */
export interface IProcessUrlQueue {
  alreadyClaimed(jobId: string, url: string): Promise<boolean>;

  enqueue(data: CrawlFrontierMessage): Promise<void>;
}

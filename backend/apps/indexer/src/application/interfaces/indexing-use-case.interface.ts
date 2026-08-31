import type { PageScrapedMessage } from '@app/kafka-contracts';

/**
 * Implemented by IndexingService. Consumed by IndexingWorker. Two methods, not one — same split
 * as the Scraper's IProcessUrlUseCase and for the same reason: `handle` runs once per BullMQ
 * *attempt*, `finalizeIndex` runs exactly once per *page*, after BullMQ has truly finished with
 * it. See docs/planning/03-crawler-scraper-indexing-plan.md §6-§7.
 */
export interface IIndexingUseCase {
  /** One attempt: fetch, strip, chunk, embed, delete stale vectors, upsert. Throws
   * PermanentIndexError or a plain (transient) Error — never touches pending_index. */
  handle(data: PageScrapedMessage): Promise<void>;

  /** Decrements pending_index and, if this is the ONLY place in the system that ever declares job
   * completion, publishes `crawl-complete` — see §6 for why the Scraper never does. */
  finalizeIndex(
    data: PageScrapedMessage,
    outcome: 'succeeded' | 'failed',
  ): Promise<void>;
}

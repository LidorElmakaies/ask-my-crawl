import type { PageScrapedMessage } from '@app/kafka-contracts';

/**
 * Implemented by IndexingService. Consumed by the API layer (IndexingWorker).
 *
 * Deliberately two methods, not one — same split as the Scraper's IProcessUrlUseCase, for the same
 * reason: `handle` runs once per BullMQ *attempt*, `finalizeIndex` runs exactly once per *page*,
 * only after BullMQ has truly finished with it (success, or no more retries coming). Folding both
 * into one method would either double-decrement the job's `pending_index` counter (if a transient
 * failure about to be retried was treated as final) or leave it stuck forever (if a
 * truly-exhausted job was never treated as final). See IndexingWorker for how the two get wired
 * together, and docs/planning/03-crawler-scraper-indexing-plan.md §6-§7 for the full mechanism.
 */
export interface IIndexingUseCase {
  /** One attempt: fetch the page's blob, strip HTML to text, chunk it, embed the chunks, delete
   * any stale vectors for the URL, upsert the new ones. Throws PermanentIndexError (missing blob,
   * unparseable HTML, a persistent embedding-response mismatch) or a plain Error (transient) on
   * failure — never touches pending_index or the completion check itself. */
  handle(data: PageScrapedMessage): Promise<void>;

  /** Runs once per page, after BullMQ has truly finished with it. Decrements pending_index (does
   * NOT touch the succeeded/failed Redis sets — those stay scrape-stage-only, see
   * indexing.service.ts) and — if this call observes both pending counters at zero and wins the
   * `SET NX` completion guard — publishes `crawl-complete`. This is the ONLY place in the whole
   * system that ever does so; the Scraper's finalizeUrl deliberately never checks for completion
   * (see docs/planning/03-crawler-scraper-indexing-plan.md §6 for why). Takes the same message
   * `handle()` was called with, same reasoning as ProcessUrlWorker's finalizeUrl. */
  finalizeIndex(
    data: PageScrapedMessage,
    outcome: 'succeeded' | 'failed',
  ): Promise<void>;
}

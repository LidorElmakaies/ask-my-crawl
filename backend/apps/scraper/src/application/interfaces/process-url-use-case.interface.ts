import type { CrawlFrontierMessage } from '@app/kafka-contracts';

/**
 * Implemented by ProcessUrlService. Consumed by the API layer (ProcessUrlWorker).
 *
 * Deliberately two methods, not one — `handle` runs once per BullMQ *attempt*, `finalizeUrl` runs
 * exactly once per *URL*, only after BullMQ has truly finished with it (success, or no more
 * retries coming). Folding both into one method would either double-decrement the job's
 * `pending_scrape` counter (if a transient failure that's about to be retried was treated as
 * final) or leave it stuck forever (if a truly-exhausted job was never treated as final) — verified
 * against BullMQ's own `failed`-event semantics (docs.bullmq.io/guide/retrying-failing-jobs) before
 * splitting it this way, not assumed. See ProcessUrlWorker for how the two get wired together, and
 * docs/planning/03-crawler-scraper-indexing-plan.md §5/§6 for the full mechanism.
 */
export interface IProcessUrlUseCase {
  /** One fetch attempt: fetch the page, save its blob, extract+filter same-domain child links,
   * publish `page-scraped` and any child `crawl-frontier` messages. Throws PermanentFetchError
   * (4xx, or an unsupported content type) or a plain Error (transient) on failure — never touches
   * pending_scrape/succeeded/failed/completion-check itself. */
  handle(data: CrawlFrontierMessage): Promise<void>;

  /** Runs once per URL, after BullMQ has truly finished with it. Marks succeeded/failed and
   * decrements pending_scrape — nothing more. Only the Indexer's finalizeIndex() checks for job
   * completion and publishes `crawl-complete` — see
   * docs/planning/03-crawler-scraper-indexing-plan.md §6. */
  finalizeUrl(
    data: CrawlFrontierMessage,
    outcome: 'succeeded' | 'failed',
  ): Promise<void>;
}

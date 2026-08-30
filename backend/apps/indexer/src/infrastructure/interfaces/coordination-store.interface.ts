export interface PendingCounts {
  pendingScrape: number;
  pendingIndex: number;
}

export interface CompletionUrls {
  succeededUrls: string[];
  failedUrls: string[];
}

/**
 * Implemented by RedisCoordinationStore. Consumed by the Application layer (IndexIntakeService,
 * IndexingService) — per-job coordination state shared with the Scraper (dedup set, pending
 * counters, completion guard, not owned domain data). Scoped to only what the Indexer needs:
 * unlike the Scraper's own ICoordinationStore, there's no `tryMarkVisited`/`markSucceeded`/
 * `markFailed` here — the Indexer doesn't dedup `page-scraped` messages (each one is already a
 * unique scraped page) and doesn't touch the succeeded/failed sets (those stay scrape-stage-only,
 * see indexing.service.ts's doc comment). See docs/planning/03-crawler-scraper-indexing-plan.md
 * §6-§7 and docs/specs/data-model.md's Redis key table.
 *
 * This is the Indexer's own independent copy, not shared code with the Scraper's identically-named
 * interface — see redis-coordination.store.ts's doc comment for why.
 */
export interface ICoordinationStore {
  incrementPendingIndex(jobId: string): Promise<void>;
  /** Returns the pending counts AFTER decrementing pending_index, so the caller can check for the
   * zero-zero completion state without a second round trip. Reads pending_scrape via a plain GET —
   * the Scraper is the only writer of that counter, this side only ever reads it. */
  decrementPendingIndex(jobId: string): Promise<PendingCounts>;

  getCompletionUrls(jobId: string): Promise<CompletionUrls>;

  /** SET job:{job_id}:notified NX. The Indexer is the only caller that ever reaches this (the
   * Scraper's finalizeUrl doesn't check for completion at all — see
   * docs/planning/03-crawler-scraper-indexing-plan.md §6), so in practice this guards against a
   * single known gap: at-least-once Kafka redelivery of the same page-scraped message could
   * decrement pending_index twice for one page, which could otherwise let finalizeIndex observe
   * zero-zero and publish crawl-complete more than once for the same job. */
  tryClaimCompletion(jobId: string): Promise<boolean>;

  /** EXPIRE every job:{job_id}:* key — called once, only by whichever caller won
   * tryClaimCompletion. */
  expireJobKeys(jobId: string, ttlSeconds: number): Promise<void>;
}

export interface PendingCounts {
  pendingScrape: number;
  pendingIndex: number;
}

export interface CompletionUrls {
  succeededUrls: string[];
  failedUrls: string[];
}

/**
 * Implemented by RedisCoordinationStore. Consumed by the Application layer
 * (FrontierIntakeService, ProcessUrlService) — per-job coordination state shared with the Indexer
 * once it's built (dedup set, pending counters, completion race guard, not owned domain data). See
 * docs/planning/03-crawler-scraper-indexing-plan.md §4-§6 and docs/specs/data-model.md's Redis key
 * table.
 */
export interface ICoordinationStore {
  /** SADD crawl:{job_id}:visited — returns true if the URL was newly added (not a duplicate). This
   * is the single authoritative dedup gate; redelivery of the same message is expected to be
   * harmless via this check. */
  tryMarkVisited(jobId: string, url: string): Promise<boolean>;

  incrementPendingScrape(jobId: string): Promise<void>;
  /** Returns the pending counts AFTER decrementing, so the caller can check for the zero-zero
   * completion state without a second round trip. */
  decrementPendingScrape(jobId: string): Promise<PendingCounts>;

  markSucceeded(jobId: string, url: string): Promise<void>;
  markFailed(jobId: string, url: string): Promise<void>;
  getCompletionUrls(jobId: string): Promise<CompletionUrls>;

  /** SET job:{job_id}:notified NX — true only for the ONE caller across the whole system (Scraper
   * or, once built, the Indexer) that wins the completion race for this job. */
  tryClaimCompletion(jobId: string): Promise<boolean>;

  /** EXPIRE every job:{job_id}:* key — called once, only by whichever caller won
   * tryClaimCompletion. */
  expireJobKeys(jobId: string, ttlSeconds: number): Promise<void>;
}

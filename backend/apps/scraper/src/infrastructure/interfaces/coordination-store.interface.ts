/**
 * Implemented by RedisCoordinationStore. Consumed by the Application layer
 * (FrontierIntakeService, ProcessUrlService) — per-job coordination state shared with the Indexer
 * (dedup set, pending counters — not owned domain data). See
 * docs/planning/03-crawler-scraper-indexing-plan.md §4-§6 and docs/specs/data-model.md's Redis key
 * table. Deliberately narrower than the Indexer's own copy: only the Indexer's finalizeIndex() ever
 * checks for job completion or publishes crawl-complete, so the Scraper has no need for
 * tryClaimCompletion/getCompletionUrls/expireJobKeys — see process-url.service.ts's finalizeUrl.
 */
export interface ICoordinationStore {
  /** SADD crawl:{job_id}:visited — returns true if the URL was newly added (not a duplicate). This
   * is the single authoritative dedup gate; redelivery of the same message is expected to be
   * harmless via this check. */
  tryMarkVisited(jobId: string, url: string): Promise<boolean>;

  incrementPendingScrape(jobId: string): Promise<void>;
  decrementPendingScrape(jobId: string): Promise<void>;

  markSucceeded(jobId: string, url: string): Promise<void>;
  markFailed(jobId: string, url: string): Promise<void>;
}

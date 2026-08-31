export interface PendingCounts {
  pendingScrape: number;
  pendingIndex: number;
}

export interface CompletionUrls {
  succeededUrls: string[];
  failedUrls: string[];
}

/**
 * Implemented by RedisCoordinationStore. Consumed by IndexIntakeService/IndexingService. Own
 * independent copy of the Scraper's ICoordinationStore, scoped to what the Indexer needs — see
 * docs/planning/03-crawler-scraper-indexing-plan.md §6-§7 and docs/specs/data-model.md.
 */
export interface ICoordinationStore {
  incrementPendingIndex(jobId: string): Promise<void>;
  /** Returns counts AFTER decrementing pending_index — pending_scrape is read-only here. */
  decrementPendingIndex(jobId: string): Promise<PendingCounts>;

  getCompletionUrls(jobId: string): Promise<CompletionUrls>;

  /** SET job:{job_id}:notified NX — guards against duplicate finalizeIndex calls (at-least-once
   * Kafka redelivery) publishing crawl-complete more than once for the same job. */
  tryClaimCompletion(jobId: string): Promise<boolean>;

  /** EXPIRE every job:{job_id}:* key — called once, by whoever won tryClaimCompletion. */
  expireJobKeys(jobId: string, ttlSeconds: number): Promise<void>;
}

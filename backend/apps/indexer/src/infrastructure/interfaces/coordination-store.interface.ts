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
 * independent copy of the Scraper's ICoordinationStore — see
 * docs/planning/03-crawler-scraper-indexing-plan.md §6-§7 and docs/specs/data-model.md.
 */
export interface ICoordinationStore {
  addPendingIndex(jobId: string, url: string): Promise<void>;
  /** Returns counts AFTER removing — pending_scrape is read-only here. */
  removePendingIndex(jobId: string, url: string): Promise<PendingCounts>;

  getCompletionUrls(jobId: string): Promise<CompletionUrls>;

  tryClaimCompletion(jobId: string): Promise<boolean>;

  expireJobKeys(jobId: string, ttlSeconds: number): Promise<void>;
}

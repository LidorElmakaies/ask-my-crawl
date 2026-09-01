/**
 * Implemented by RedisCoordinationStore. Consumed by the Application layer
 * (FrontierIntakeService, ProcessUrlService). See
 * docs/planning/03-crawler-scraper-indexing-plan.md §4-§6 and docs/specs/data-model.md's Redis key
 * table. Deliberately narrower than the Indexer's own copy — see process-url.service.ts's
 * finalizeUrl.
 */
export interface ICoordinationStore {
  addPendingScrape(jobId: string, url: string): Promise<void>;
  removePendingScrape(jobId: string, url: string): Promise<void>;

  markSucceeded(jobId: string, url: string): Promise<void>;
  markFailed(jobId: string, url: string): Promise<void>;
}

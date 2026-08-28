export interface PageFetchResult {
  contentType: string | undefined;
  body: string;
}

/**
 * Implemented by FetchPageFetcher (plain HTTP, 30s timeout, no headless browser). Throws
 * PermanentFetchError for a 4xx response (retrying can't help); throws a plain Error for anything
 * transient (timeout, connection error, 5xx) so BullMQ's attempts/backoff can retry. See
 * docs/planning/03-crawler-scraper-indexing-plan.md §5.
 */
export interface IPageFetcher {
  fetch(url: string): Promise<PageFetchResult>;
}

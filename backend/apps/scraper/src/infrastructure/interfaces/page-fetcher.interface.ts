export interface PageFetchResult {
  contentType: string | undefined;
  body: string;
}

/** Implemented by FetchPageFetcher. Throws PermanentFetchError for a 4xx response, a plain
 * (transient) Error for anything else. */
export interface IPageFetcher {
  fetch(url: string): Promise<PageFetchResult>;
}

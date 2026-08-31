/** Implemented by S3BlobRepository. Consumed by IndexingService — reads the raw HTML the Scraper
 * saved, keyed by blobKey. Read-only (unlike the Scraper's identically-named interface). */
export interface IBlobRepository {
  get(blobKey: string): Promise<string>;
}

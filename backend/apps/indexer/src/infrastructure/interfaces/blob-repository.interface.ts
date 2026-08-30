/**
 * Implemented by S3BlobRepository (SeaweedFS's S3-compatible API). Consumed by the Application
 * layer (IndexingService) — reads the raw scraped HTML the Scraper saved, keyed by
 * sha256(normalizedUrl) (the PageScrapedMessage's own `blobKey`). Read-only: unlike the Scraper's
 * identically-named interface (which only `save()`s), the Indexer only ever `get()`s — see
 * s3-blob.repository.ts's doc comment for why this is the Indexer's own copy, not shared code.
 */
export interface IBlobRepository {
  get(blobKey: string): Promise<string>;
}

/**
 * Implemented by S3BlobRepository (SeaweedFS's S3-compatible API). Consumed by the Application
 * layer (ProcessUrlService) — raw scraped HTML, keyed by sha256(normalizedUrl). See
 * docs/planning/03-crawler-scraper-indexing-plan.md §5/§8.
 */
export interface IBlobRepository {
  save(blobKey: string, content: string, contentType: string): Promise<void>;
}

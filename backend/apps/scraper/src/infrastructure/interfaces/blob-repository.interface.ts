/** Implemented by S3BlobRepository. Consumed by ProcessUrlService — raw scraped HTML, keyed by
 * sha256(normalizedUrl). */
export interface IBlobRepository {
  save(blobKey: string, content: string, contentType: string): Promise<void>;
}

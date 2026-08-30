/**
 * One embedded chunk, ready to upsert. Scalar fields per docs/specs/data-model.md's Qdrant payload
 * schema (job_id/user_id/url/query/chunk_index/scraped_at) plus `text` — the chunk's own content, an
 * addition beyond that documented list: Query/Answer Service needs the real text back from a
 * similarity search, not just a vector, so it has to live somewhere retrievable. Flagged as a
 * deliberate addition, not a silent invention — see this app's plan/CLAUDE.md note.
 */
export interface VectorChunk {
  jobId: string;
  userId: string;
  url: string;
  query: string;
  chunkIndex: number;
  scrapedAt: string;
  text: string;
  vector: number[];
}

/**
 * Implemented by QdrantVectorStore (@qdrant/js-client-rest). Consumed by the Application layer
 * (IndexingService). Index type/metric fixed at HNSW/COSINE per data-model.md — not configurable.
 */
export interface IVectorStore {
  /** Idempotent — creates the collection (with its HNSW/COSINE index, built in at creation time) if
   * it doesn't already exist (checked via collectionExists), a no-op otherwise. Called once per
   * process lifetime (IndexingService calls it lazily on first use, not eagerly at bootstrap, so a
   * Qdrant outage at startup doesn't crash the whole app before any real work is attempted). */
  ensureCollection(): Promise<void>;

  /** Deletes every existing chunk row for this exact URL (Qdrant delete-by-filter, `url` payload
   * field match) — always called before upsert, whether or not the new chunk set is empty, so a
   * page that's gone empty on re-scrape still has its stale vectors removed. */
  deleteByUrl(url: string): Promise<void>;

  /** No-op for an empty array — callers don't need to special-case a zero-chunk page. */
  upsert(chunks: VectorChunk[]): Promise<void>;
}

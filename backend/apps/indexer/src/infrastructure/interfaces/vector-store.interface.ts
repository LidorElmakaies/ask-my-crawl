/** One embedded chunk, ready to upsert. Payload fields per docs/specs/data-model.md. */
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
  /** Idempotent — creates the collection if it doesn't exist. Called lazily on first use, not
   * eagerly at bootstrap. */
  ensureCollection(): Promise<void>;

  /** Deletes every chunk for this URL — always called before upsert, even for an empty chunk set. */
  deleteByUrl(url: string): Promise<void>;

  /** No-op for an empty array — callers don't need to special-case a zero-chunk page. */
  upsert(chunks: VectorChunk[]): Promise<void>;
}

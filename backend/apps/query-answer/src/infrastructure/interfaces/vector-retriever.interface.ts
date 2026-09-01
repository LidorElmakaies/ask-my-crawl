/** One retrieved chunk, ready to fold into the LLM prompt. */
export interface RetrievedChunk {
  text: string;
  url: string;
  score: number;
}

/**
 * Implemented by QdrantVectorRetriever (@qdrant/js-client-rest, read-only). Consumed by
 * AnsweringService. Unlike the Indexer's IVectorStore, this interface never writes — the
 * collection is guaranteed to already exist by the time crawl-complete fires.
 */
export interface IVectorRetriever {
  /** Top-K nearest chunks for this job only (job_id-scoped filter) — never leaks another job's
   * pages into the prompt. */
  search(vector: number[], jobId: string): Promise<RetrievedChunk[]>;
}

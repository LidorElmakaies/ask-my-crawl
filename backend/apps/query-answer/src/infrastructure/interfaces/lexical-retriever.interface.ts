import type { RetrievedChunk } from '../../models/retrieved-chunk';

/** Implemented by QdrantLexicalRetriever — BM25 search, the counterpart to IVectorRetriever's
 * dense search. Consumed by AnsweringService. */
export interface ILexicalRetriever {
  /** One ranked list per entry in `queries`, up to RETRIEVAL_TOP_K chunks each (job_id-scoped). */
  searchMany(queries: string[], jobId: string): Promise<RetrievedChunk[][]>;
}

import type { RetrievedChunk } from '../../models/retrieved-chunk';

export type { RetrievedChunk };

/** Implemented by QdrantVectorRetriever. Consumed by AnsweringService — one of the two retrieval
 * modalities fused via RRF, see ILexicalRetriever for the other. */
export interface IVectorRetriever {
  /** Up to RETRIEVAL_TOP_K nearest chunks for this job (job_id-scoped), by cosine similarity. */
  search(vector: number[], jobId: string): Promise<RetrievedChunk[]>;
}

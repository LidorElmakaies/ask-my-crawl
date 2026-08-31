/** Implemented by OpenAiEmbeddingClient — any OpenAI-compatible server via EMBEDDING_BASE_URL.
 * Consumed by IndexingService. */
export interface IEmbeddingClient {
  /** One vector per input text, same order. Throws (transient) on connection error/timeout/5xx, or
   * PermanentIndexError-worthy on a dimension mismatch — see the implementation. */
  embed(texts: string[]): Promise<number[][]>;
}

/** Implemented by OpenAiEmbeddingClient — any OpenAI-compatible server via EMBEDDING_BASE_URL.
 * Consumed by AnsweringService. Own scoped copy of the Indexer's identical interface — see
 * docs/planning/03-crawler-scraper-indexing-plan.md and the note on this app's
 * OpenAiEmbeddingClient about why the config MUST match the Indexer's exactly. */
export interface IEmbeddingClient {
  /** One vector per input text, same order. Throws (transient) on connection error/timeout/5xx, or
   * PermanentAnswerError-worthy on a dimension mismatch — see the implementation. */
  embed(texts: string[]): Promise<number[][]>;
}

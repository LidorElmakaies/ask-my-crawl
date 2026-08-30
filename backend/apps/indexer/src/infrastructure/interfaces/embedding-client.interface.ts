/**
 * Implemented by OpenAiEmbeddingClient (@langchain/openai's OpenAIEmbeddings, pointed at any
 * OpenAI-compatible embedding server via EMBEDDING_BASE_URL — provider-agnostic; currently a
 * self-hosted LM Studio instance, per docs/specs/README.md's decided embedding-provider direction,
 * but swapping providers is a config change, not a code change). Consumed by the Application layer
 * (IndexingService).
 */
export interface IEmbeddingClient {
  /** One vector per input text, same order. Throws on a connection error/timeout/5xx (transient —
   * IndexingWorker lets BullMQ retry) or on a response whose vector dimension doesn't match
   * EMBEDDING_DIMENSION (permanent — a persistent misconfiguration, not fixed by retrying). */
  embed(texts: string[]): Promise<number[][]>;
}

/** Implemented by ChatOpenAiClient — any OpenAI-compatible chat-completions server via
 * LLM_BASE_URL. Consumed by AnsweringService. */
export interface ILlmClient {
  /** Throws (transient) on connection error/timeout/5xx — let BullMQ retry. */
  generateAnswer(systemPrompt: string, userPrompt: string): Promise<string>;
}

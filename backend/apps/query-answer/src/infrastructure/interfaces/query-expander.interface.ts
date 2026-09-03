/** Implemented by LlmQueryExpanderClient. Consumed by AnsweringService. */
export interface IQueryExpander {
  /** Returns `[originalQuery, ...rewrites]`. Never throws — falls back to `[originalQuery]` on
   * any failure. */
  expand(query: string): Promise<string[]>;
}

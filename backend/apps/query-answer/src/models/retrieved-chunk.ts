/** One retrieved chunk, ready to fold into the LLM prompt. */
export interface RetrievedChunk {
  text: string;
  url: string;
  chunkIndex: number;
  score: number;
}

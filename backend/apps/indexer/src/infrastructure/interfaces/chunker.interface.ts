/** Implemented by RecursiveChunker. Consumed by IndexingService. */
export interface IChunker {
  split(text: string): Promise<string[]>;
}

/**
 * Implemented by RecursiveChunker (wraps @langchain/textsplitters' RecursiveCharacterTextSplitter).
 * Consumed by the Application layer (IndexingService) — splits a page's plain text into
 * embeddable chunks. Behind an interface, not called directly from Application code, per
 * backend-architecture.md's rule that a concrete library call is always an Infrastructure adapter.
 */
export interface IChunker {
  split(text: string): Promise<string[]>;
}

/** Implemented by CheerioTextExtractor. Consumed by IndexingService. */
export interface ITextExtractor {
  extract(html: string): string;
}

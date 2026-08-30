/**
 * Implemented by CheerioTextExtractor. Consumed by the Application layer (IndexingService) — turns
 * a raw HTML blob into plain text before chunking. Deliberately reuses `cheerio` (already a
 * project dependency, already used by the Scraper's CheerioLinkExtractor) instead of pulling in
 * `@langchain/community`'s heavier HTML document transformer for one utility — see this app's plan
 * doc/CLAUDE.md note on that decision.
 */
export interface ITextExtractor {
  extract(html: string): string;
}

/**
 * Implemented by CheerioLinkExtractor. Returns raw absolute URLs found in `<a href>` — no
 * domain/depth filtering here, that's ProcessUrlService's job (domain logic, not a parsing
 * concern). See docs/planning/03-crawler-scraper-indexing-plan.md §5.
 */
export interface IHtmlLinkExtractor {
  extractLinks(html: string, baseUrl: string): string[];
}

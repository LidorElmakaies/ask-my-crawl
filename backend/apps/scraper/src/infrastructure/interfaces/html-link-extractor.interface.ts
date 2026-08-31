/** Implemented by CheerioLinkExtractor. Returns raw absolute URLs — no domain/depth filtering
 * here, that's ProcessUrlService's job. */
export interface IHtmlLinkExtractor {
  extractLinks(html: string, baseUrl: string): string[];
}

import { Injectable } from '@nestjs/common';
import { load } from 'cheerio';
import type { IHtmlLinkExtractor } from '../interfaces/html-link-extractor.interface';

@Injectable()
export class CheerioLinkExtractor implements IHtmlLinkExtractor {
  extractLinks(html: string, baseUrl: string): string[] {
    const $ = load(html);
    const links: string[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      try {
        // Resolves a relative href against baseUrl into an absolute URL. Anything unparseable
        // (mailto:, javascript:, malformed) is skipped here, not thrown — same-domain/depth
        // filtering happens one layer up, in ProcessUrlService.
        links.push(new URL(href, baseUrl).toString());
      } catch {
        // not a parseable URL — skip
      }
    });
    return links;
  }
}

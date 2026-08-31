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
        links.push(new URL(href, baseUrl).toString()); // resolve relative -> absolute
      } catch {
        // not a parseable URL — skip
      }
    });
    return links;
  }
}

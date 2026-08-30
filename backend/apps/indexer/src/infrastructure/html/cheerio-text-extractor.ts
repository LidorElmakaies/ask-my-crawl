import { Injectable } from '@nestjs/common';
import { load } from 'cheerio';
import type { ITextExtractor } from '../interfaces/text-extractor.interface';

// Strips a raw HTML blob down to plain, readable text — reuses cheerio (already a project
// dependency, already used by the Scraper's CheerioLinkExtractor) instead of pulling in
// @langchain/community's heavier HTML document transformer for one utility. Drops elements whose
// content is never real page text (script/style tags) or is mostly navigation boilerplate
// (nav/header/footer) before extracting, so embeddings aren't spent on menu labels.
@Injectable()
export class CheerioTextExtractor implements ITextExtractor {
  extract(html: string): string {
    const $ = load(html);
    $('script, style, nav, header, footer').remove();
    // Collapse runs of whitespace (cheerio's .text() preserves the source's original whitespace/
    // newlines verbatim) so chunk boundaries land on real content, not indentation.
    return $('body').text().replace(/\s+/g, ' ').trim();
  }
}

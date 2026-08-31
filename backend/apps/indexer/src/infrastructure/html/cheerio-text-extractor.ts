import { Injectable } from '@nestjs/common';
import { load } from 'cheerio';
import type { ITextExtractor } from '../interfaces/text-extractor.interface';

// Strips raw HTML down to plain text via cheerio — drops script/style/nav/header/footer so
// embeddings aren't spent on menu labels.
@Injectable()
export class CheerioTextExtractor implements ITextExtractor {
  extract(html: string): string {
    const $ = load(html);
    $('script, style, nav, header, footer').remove();
    return $('body').text().replace(/\s+/g, ' ').trim(); // collapse whitespace/newlines
  }
}

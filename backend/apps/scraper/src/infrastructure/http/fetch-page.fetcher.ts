import { Injectable } from '@nestjs/common';
import { SCRAPER_USER_AGENT } from '../../models/constants';
import { PermanentFetchError } from '../../models/permanent-fetch-error';
import type {
  IPageFetcher,
  PageFetchResult,
} from '../interfaces/page-fetcher.interface';

const FETCH_TIMEOUT_MS = 30_000;

// Plain HTTP fetch, no headless browser — see docs/planning/03-crawler-scraper-indexing-plan.md
// §5. 4xx -> PermanentFetchError; everything else (timeout, connection error, 5xx) -> transient.
@Injectable()
export class FetchPageFetcher implements IPageFetcher {
  async fetch(url: string): Promise<PageFetchResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await globalThis.fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': SCRAPER_USER_AGENT },
      });
    } catch (err) {
      // AbortError (timeout) or a network/connection failure — both transient.
      throw new Error(
        `Transient fetch failure for ${url}: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 400 && response.status < 500) {
      throw new PermanentFetchError(
        `Permanent fetch failure for ${url}: HTTP ${response.status}`,
        response.status,
      );
    }
    if (!response.ok) {
      // 5xx (or an unexpected redirect status fetch() didn't already follow) — transient.
      throw new Error(
        `Transient fetch failure for ${url}: HTTP ${response.status}`,
      );
    }

    const body = await response.text();
    return {
      contentType: response.headers.get('content-type') ?? undefined,
      body,
    };
  }
}

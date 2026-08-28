import { Injectable } from '@nestjs/common';
import robotsParser, { Robot } from 'robots-parser';
import { SCRAPER_USER_AGENT } from '../../models/constants';
import type { IRobotsTxtChecker } from '../interfaces/robots-txt-checker.interface';

const ROBOTS_FETCH_TIMEOUT_MS = 10_000;

// Fetches and parses each domain's robots.txt once, caches the parsed result in memory for the
// rest of this process's life (per-origin — a fresh container/replica re-fetches; no TTL, since a
// single dev-phase process is expected to run far fewer distinct domains than would make that
// matter). If robots.txt is missing (404) or can't be fetched at all, the domain is treated as
// unrestricted — standard crawler behavior, not a special case to flag.
@Injectable()
export class RobotsTxtChecker implements IRobotsTxtChecker {
  private readonly cache = new Map<string, Robot | null>();

  async isAllowed(url: string): Promise<boolean> {
    const origin = new URL(url).origin;
    let robots = this.cache.get(origin);

    if (robots === undefined) {
      robots = await this.fetchAndParse(origin);
      this.cache.set(origin, robots);
    }

    if (!robots) return true; // no robots.txt, or couldn't be fetched -> unrestricted

    const allowed = robots.isAllowed(url, SCRAPER_USER_AGENT);
    // isAllowed returns undefined for a URL that doesn't belong to this robots.txt's own origin —
    // shouldn't happen here since `robots` is always keyed/fetched by the same `origin`, but default
    // to allowed rather than let `undefined` propagate as a falsy block.
    return allowed !== false;
  }

  private async fetchAndParse(origin: string): Promise<Robot | null> {
    const robotsUrl = `${origin}/robots.txt`;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      ROBOTS_FETCH_TIMEOUT_MS,
    );

    try {
      const response = await fetch(robotsUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': SCRAPER_USER_AGENT },
      });
      if (!response.ok) return null; // 404 (most common) or any other non-2xx -> unrestricted
      const body = await response.text();
      return robotsParser(robotsUrl, body);
    } catch {
      return null; // network error, timeout, ... -> unrestricted, same as a missing robots.txt
    } finally {
      clearTimeout(timeout);
    }
  }
}

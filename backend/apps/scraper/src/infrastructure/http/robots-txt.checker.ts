import { Injectable } from '@nestjs/common';
import robotsParser, { Robot } from 'robots-parser';
import { SCRAPER_USER_AGENT } from '../../models/constants';
import type { IRobotsTxtChecker } from '../interfaces/robots-txt-checker.interface';

const ROBOTS_FETCH_TIMEOUT_MS = 10_000;

// Fetches and parses each domain's robots.txt once, caches in memory per-origin for the process's
// life. Missing/unfetchable robots.txt -> treated as unrestricted.
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
    return allowed !== false; // undefined defaults to allowed
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

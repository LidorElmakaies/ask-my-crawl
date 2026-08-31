// Wire format for the `crawl-frontier` topic, matching docs/specs/event-schemas.md.

/** Max crawl depth, as a remaining-hops budget — the seed message starts `depth` at this value,
 * each hop decrements it by 1, the Scraper stops expanding once it reaches 0. */
export const MAX_CRAWL_DEPTH = 3;

export interface CrawlFrontierMessage {
  job_id: string;
  user_id: string;
  url: string;
  depth: number; // remaining-hops budget, see MAX_CRAWL_DEPTH
  query: string; // propagate-only
  base_url: string; // propagate-only — the job's seed URL
}

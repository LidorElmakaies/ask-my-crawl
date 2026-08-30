// Wire format for the `page-scraped` topic, matching docs/specs/event-schemas.md. Fired by the
// Scraper's Scraper Worker once a page's raw HTML is saved to SeaweedFS; bridges into the Indexer's
// `index-page` BullMQ queue via its Index Intake Consumer. See
// docs/planning/03-crawler-scraper-indexing-plan.md §5e for the producer-side detail.
export interface PageScrapedMessage {
  job_id: string;
  user_id: string;
  url: string; // as discovered, not normalized
  normalizedUrl: string; // fragment stripped (see the plan doc §2) — SeaweedFS blob key is sha256(this)
  blobKey: string; // sha256(normalizedUrl) — SeaweedFS object key
  depth: number; // remaining-hops budget at the time this page was scraped, see crawl-frontier-message.ts
  scrapedAt: string; // ISO8601
  query: string; // propagate-only, same as on crawl-frontier
  base_url: string; // propagate-only, same as on crawl-frontier — the job's seed URL
}

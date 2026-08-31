// Wire format for the `crawl-complete` topic, matching docs/specs/event-schemas.md. Produced only
// by the Indexer — see docs/planning/03-crawler-scraper-indexing-plan.md §6.
export interface CrawlCompleteMessage {
  job_id: string;
  user_id: string;
  query: string;
  url: string; // base_url — the original seed URL
  succeeded_count: number;
  failed_count: number;
  succeeded_urls: string[];
  failed_urls: string[];
}

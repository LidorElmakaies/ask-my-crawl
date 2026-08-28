// Wire format for the `crawl-complete` topic, matching docs/specs/event-schemas.md. Fired once a
// job's two Redis pending-work counters (pending_scrape, pending_index) both reach zero — a
// `SET NX` race guard ensures exactly one producer per job (the Scraper's Scraper Worker or the
// Indexer's Indexing Worker, whichever observes the zero-zero state first). See
// docs/planning/03-crawler-scraper-indexing-plan.md §6 for the full completion-detection mechanism.
//
// Grew from a thin {job_id, user_id, query} trigger (2026-08-26 redesign) into a full result
// summary, so Query/Answer Service can act without a callback to fetch counts/URL lists separately.
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

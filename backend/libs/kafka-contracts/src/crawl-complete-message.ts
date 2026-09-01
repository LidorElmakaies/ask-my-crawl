// Wire format for the `crawl-complete` topic — see docs/specs/event-schemas.md.
export interface CrawlCompleteMessage {
  job_id: string;
  user_id: string;
  query: string;
  url: string;
  succeeded_count: number;
  failed_count: number;
  succeeded_urls: string[];
  failed_urls: string[];
  retry_count: number;
}

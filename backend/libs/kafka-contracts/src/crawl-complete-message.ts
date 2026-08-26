// Wire format for the `crawl-complete` topic, matching docs/specs/event-schemas.md.
export interface CrawlCompleteMessage {
  job_id: string;
  user_id: string;
  query: string;
}

// Wire format for the `crawl-frontier` topic — see docs/specs/event-schemas.md.
export interface CrawlFrontierMessage {
  job_id: string;
  user_id: string;
  url: string;
  depth: number;
  query: string;
  base_url: string;
}

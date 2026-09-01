// Wire format for the `page-scraped` topic — see docs/specs/event-schemas.md.
export interface PageScrapedMessage {
  job_id: string;
  user_id: string;
  url: string;
  normalizedUrl: string;
  blobKey: string;
  depth: number;
  scrapedAt: string;
  query: string;
  base_url: string;
}

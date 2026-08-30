// Topic names + consumer group IDs, matching docs/specs/event-schemas.md exactly. Every app that
// produces or consumes one of these topics imports the constant here rather than hardcoding the
// string, so a typo shows up as a compile error (unused import / wrong identifier) instead of a
// silently-mismatched topic name at runtime.
export const KAFKA_TOPICS = {
  JOB_REQUESTS: 'job-requests',
  CRAWL_FRONTIER: 'crawl-frontier',
  JOB_CREATED: 'job-created',
  CRAWL_COMPLETE: 'crawl-complete',
  ANSWER_READY: 'answer-ready',
  RESULT_SAVED: 'result-saved',
  // Scraper -> Indexer bridge, see docs/planning/03-crawler-scraper-indexing-plan.md.
  PAGE_SCRAPED: 'page-scraped',
} as const;

// crawl-frontier/crawl-complete still have no consumer group constant here — the Scraper both
// produces and consumes crawl-frontier (see SCRAPER below for its own consumer group), but
// crawl-complete's producer is "whichever of Scraper/Indexer wins the completion race" (plan doc
// §6), not a fixed consumer group of its own.
export const KAFKA_CONSUMER_GROUPS = {
  JOB_MANAGER: 'job-manager',
  QUERY_ANSWER: 'query-answer',
  NOTIFICATION_SERVICE: 'notification-service',
  GATEWAY: 'gateway',
  // The Scraper's Frontier Consumer (crawl-frontier) — per docs/specs/services.md.
  SCRAPER: 'scraper',
  // The Indexer's Index Intake Consumer (page-scraped) — per docs/specs/services.md.
  INDEXER: 'indexer',
} as const;

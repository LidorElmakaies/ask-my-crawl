// Topic names + consumer group IDs, matching docs/specs/event-schemas.md exactly.
export const KAFKA_TOPICS = {
  JOB_REQUESTS: 'job-requests',
  CRAWL_FRONTIER: 'crawl-frontier',
  JOB_CREATED: 'job-created',
  CRAWL_COMPLETE: 'crawl-complete',
  ANSWER_READY: 'answer-ready',
  RESULT_SAVED: 'result-saved',
  PAGE_SCRAPED: 'page-scraped', // Scraper -> Indexer bridge
} as const;

export const KAFKA_CONSUMER_GROUPS = {
  JOB_MANAGER: 'job-manager',
  QUERY_ANSWER: 'query-answer', // the Query/Answer Service's Answer Intake Consumer (crawl-complete)
  NOTIFICATION_SERVICE: 'notification-service',
  GATEWAY: 'gateway',
  SCRAPER: 'scraper', // the Scraper's Frontier Consumer (crawl-frontier)
  INDEXER: 'indexer', // the Indexer's Index Intake Consumer (page-scraped)
} as const;

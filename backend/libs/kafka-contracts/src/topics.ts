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
} as const;

// No consumer group constant for crawl-frontier/crawl-complete here — the service(s) that will
// eventually consume/produce them are undecided (possibly split into separate crawler/scraper
// services, see docs/planning/01-architecture-notes.md §4), so there's no name to commit to yet.
export const KAFKA_CONSUMER_GROUPS = {
  JOB_MANAGER: 'job-manager',
  QUERY_ANSWER: 'query-answer',
  NOTIFICATION_SERVICE: 'notification-service',
  GATEWAY: 'gateway',
} as const;

// Job-coordination cleanup window after a crawl completes (docs/planning/
// 03-crawler-scraper-indexing-plan.md §6) — shared by the Application layer (ProcessUrlService's
// explicit EXPIRE call on every job:{job_id}:* key) and the Infrastructure layer
// (RedisCoordinationStore's own SET ... EX on the notified flag), so the two can't silently drift
// apart if this ever changes.
export const JOB_KEY_TTL_SECONDS = 60 * 60;

// Identifies the crawler both in the actual page-fetch HTTP request (FetchPageFetcher) and in the
// robots.txt user-agent check (RobotsTxtChecker) — the same string is used for both so a site's
// robots.txt rules apply to the same identity that actually fetches its pages.
export const SCRAPER_USER_AGENT = 'AskMyCrawlBot/1.0';

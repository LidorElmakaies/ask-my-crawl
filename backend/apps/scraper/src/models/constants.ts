// Job-coordination cleanup window (docs/planning/03-crawler-scraper-indexing-plan.md §6).
export const JOB_KEY_TTL_SECONDS = 60 * 60;

// Used for both the fetch request and the robots.txt check, so robots.txt rules apply to the
// identity that actually fetches pages.
export const SCRAPER_USER_AGENT = 'AskMyCrawlBot/1.0';

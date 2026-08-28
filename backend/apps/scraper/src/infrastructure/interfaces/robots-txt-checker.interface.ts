/**
 * Implemented by RobotsTxtChecker. Consumed by the Application layer (ProcessUrlService) — checked
 * before every fetch, seed and re-discovered links alike. See docs/planning/
 * 03-crawler-scraper-indexing-plan.md §5.
 */
export interface IRobotsTxtChecker {
  isAllowed(url: string): Promise<boolean>;
}

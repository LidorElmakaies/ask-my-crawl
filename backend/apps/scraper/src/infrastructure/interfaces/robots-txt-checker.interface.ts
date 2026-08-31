/** Implemented by RobotsTxtChecker. Consumed by ProcessUrlService — checked before every fetch. */
export interface IRobotsTxtChecker {
  isAllowed(url: string): Promise<boolean>;
}

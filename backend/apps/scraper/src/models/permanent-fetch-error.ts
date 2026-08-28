// A failure that will never succeed on retry — an HTTP 4xx response, or (reused for the same
// reason) an unsupported content type. Thrown by Application-layer code (ProcessUrlService),
// caught only at the API boundary (process-url.worker.ts) and translated into bullmq's own
// UnrecoverableError there — this class itself has zero framework dependencies, keeping
// Application ignorant of BullMQ per docs/specs/backend-architecture.md. A plain Error, by
// contrast, means "transient — let BullMQ's attempts/backoff retry it" (timeout, connection
// error, 5xx). See docs/planning/03-crawler-scraper-indexing-plan.md §5.
export class PermanentFetchError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'PermanentFetchError';
  }
}

// Wire format for the `job-requests` topic, matching docs/specs/event-schemas.md — snake_case,
// no mapping layer between this type and the actual Kafka message value.
//
// No `job_id` — Gateway publishes this before any job row exists. Job Manager Service is the
// sole owner of `job_id` generation (see job-created-message.ts).
export interface JobRequestsMessage {
  user_id: string;
  /** Gateway does not normalize this — whatever consumes crawl-frontier does, on receipt. */
  url: string;
  query: string;
}

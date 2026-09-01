// Wire format for the `job-created` topic — see docs/specs/event-schemas.md.
export interface JobCreatedMessage {
  job_id: string;
  user_id: string;
  url: string;
  query: string;
}

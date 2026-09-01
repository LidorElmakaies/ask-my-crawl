// Wire format for the `job-requests` topic — see docs/specs/event-schemas.md.
export interface JobRequestsMessage {
  user_id: string;
  url: string;
  query: string;
}

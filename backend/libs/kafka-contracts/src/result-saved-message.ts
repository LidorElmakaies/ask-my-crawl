// Wire format for the `result-saved` topic — see docs/specs/event-schemas.md.
export interface ResultSavedMessage {
  job_id: string;
  user_id: string;
  result: string | null;
  failed_reason: string | null;
}

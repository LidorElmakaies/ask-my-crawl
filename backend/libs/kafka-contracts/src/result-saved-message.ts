// Wire format for the `result-saved` topic, matching docs/specs/event-schemas.md.
//
// No `completed_at` — the `jobs` table carries no timestamps, see data-model.md.
export interface ResultSavedMessage {
  job_id: string;
  user_id: string;
  result: string;
}

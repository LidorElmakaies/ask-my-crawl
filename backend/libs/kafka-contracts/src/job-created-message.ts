// Wire format for the `job-created` topic, matching docs/specs/event-schemas.md.
//
// Matches the `jobs` row Job Manager Service creates minus `result` (still NULL at this point) —
// no `status` field, that column doesn't exist (see data-model.md).
export interface JobCreatedMessage {
  job_id: string;
  user_id: string;
  url: string;
  query: string;
}

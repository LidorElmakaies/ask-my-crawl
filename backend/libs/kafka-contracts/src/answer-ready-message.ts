// Wire format for the `answer-ready` topic — see docs/specs/event-schemas.md.
export interface AnswerReadyMessage {
  job_id: string;
  user_id: string;
  answer_text: string | null;
  failed_reason: string | null;
}

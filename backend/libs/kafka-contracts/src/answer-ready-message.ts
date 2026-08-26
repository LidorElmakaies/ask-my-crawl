// Wire format for the `answer-ready` topic, matching docs/specs/event-schemas.md.
//
// No `source_urls` field: Query/Answer Service runs retrieval against the Indexer internally to
// build the LLM prompt, but nothing carries that source list any further than this call.
export interface AnswerReadyMessage {
  job_id: string;
  user_id: string;
  answer_text: string;
}

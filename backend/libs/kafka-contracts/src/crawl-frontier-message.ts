// Wire format for the `crawl-frontier` topic, matching docs/specs/event-schemas.md — snake_case,
// no mapping layer between this type and the actual Kafka message value.
//
// `query` is a deliberate spec amendment (see event-schemas.md's note on this field): the seed
// producer (Crawl Result Manager) sets it once from the job's query, and whatever re-produces a
// child message must copy it through unchanged. It exists purely so a `crawl-complete` producer
// can populate that message's own `query` field without a synchronous call back to Crawl Result
// Manager just to fetch it. Which service(s) actually produce/consume this topic is undecided —
// see docs/planning/01-architecture-notes.md §4.
/**
 * Max crawl depth, expressed as a **remaining-hops budget** — the seed message (produced by Job
 * Manager Service) starts `depth` at this value; each hop the Scraper re-publishes decrements it
 * by 1; the Scraper stops expanding a page once `depth` reaches `0`. A shared constant (not a
 * Scraper-local one) because Job Manager Service is the one that sets the seed value — see
 * event-schemas.md / data-model.md. Fixed at `3` for now; may become configurable (e.g. per-job or
 * per-user-tier) later, but nothing reads it as anything other than this constant today.
 */
export const MAX_CRAWL_DEPTH = 3;

export interface CrawlFrontierMessage {
  job_id: string;
  user_id: string;
  url: string;
  /**
   * Remaining-hops budget, not an absolute depth — starts at `MAX_CRAWL_DEPTH` on the seed
   * message and counts DOWN by 1 per hop. The Scraper stops re-publishing once this reaches `0`.
   * See `MAX_CRAWL_DEPTH`'s own doc comment above.
   */
  depth: number;
  query: string;
}

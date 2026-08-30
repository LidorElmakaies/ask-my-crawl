// A failure that will never succeed on retry — the blob genuinely doesn't exist in SeaweedFS, the
// blob's bytes can't be parsed as HTML at all, or an embedding call's response shape is
// persistently wrong (e.g. a vector dimension mismatch against EMBEDDING_DIMENSION). Thrown by
// Application-layer code (IndexingService), caught only at the API boundary (indexing.worker.ts)
// and translated into bullmq's own UnrecoverableError there — this class itself has zero
// framework dependencies, keeping Application ignorant of BullMQ per
// docs/specs/backend-architecture.md. A plain Error, by contrast, means "transient — let BullMQ's
// attempts/backoff retry it" (SeaweedFS/LM Studio/Qdrant connection error, timeout, 5xx). Mirrors
// the Scraper's PermanentFetchError (apps/scraper/src/models/permanent-fetch-error.ts).
export class PermanentIndexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentIndexError';
  }
}

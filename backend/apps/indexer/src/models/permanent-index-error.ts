// A failure retrying can't fix (missing blob, unparseable HTML, persistent dimension mismatch).
// Translated into BullMQ's UnrecoverableError at the API boundary (indexing.worker.ts) — this
// class itself has zero framework dependencies, per docs/specs/backend-architecture.md. Mirrors
// the Scraper's PermanentFetchError.
export class PermanentIndexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentIndexError';
  }
}

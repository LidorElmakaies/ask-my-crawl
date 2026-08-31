// A failure retrying can't fix — an HTTP 4xx, or an unsupported content type. Translated into
// BullMQ's UnrecoverableError at the API boundary (process-url.worker.ts).
export class PermanentFetchError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'PermanentFetchError';
  }
}

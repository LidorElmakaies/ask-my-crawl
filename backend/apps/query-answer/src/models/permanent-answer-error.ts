export class PermanentAnswerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentAnswerError';
  }
}

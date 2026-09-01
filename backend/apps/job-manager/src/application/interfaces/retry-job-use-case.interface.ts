export interface RetryJobCommand {
  jobId: string;
  userId: string;
  role: string;
}

export interface IRetryJobUseCase {
  handle(command: RetryJobCommand): Promise<void>;
}

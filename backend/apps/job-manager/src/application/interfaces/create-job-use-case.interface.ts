import type { JobRequestsMessage } from '@app/kafka-contracts';

/**
 * Implemented by the Application layer (CreateJobService). Consumed by the API layer
 * (JobRequestsConsumer).
 */
export interface ICreateJobUseCase {
  handle(input: JobRequestsMessage): Promise<void>;
}

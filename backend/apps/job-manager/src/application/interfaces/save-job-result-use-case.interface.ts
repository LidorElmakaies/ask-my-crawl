import type { AnswerReadyMessage } from '@app/kafka-contracts';

/**
 * Implemented by the Application layer (SaveJobResultService). Consumed by the API layer
 * (AnswerReadyConsumer).
 */
export interface ISaveJobResultUseCase {
  handle(input: AnswerReadyMessage): Promise<void>;
}

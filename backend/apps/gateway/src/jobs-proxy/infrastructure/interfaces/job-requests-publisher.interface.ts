import type { JobRequestsMessage } from '@app/kafka-contracts';

/**
 * Infrastructure layer interface. Implemented by KafkaJobRequestsPublisher.
 */
export interface IJobRequestsPublisher {
  publish(message: JobRequestsMessage): Promise<void>;
}

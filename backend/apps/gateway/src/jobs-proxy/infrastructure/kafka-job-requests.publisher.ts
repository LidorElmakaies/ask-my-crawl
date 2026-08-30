import { Inject, Injectable } from '@nestjs/common';
import { KAFKA_TOPICS, type JobRequestsMessage } from '@app/kafka-contracts';
import type { IEventPublisher } from '@app/kafka-client';
import { EVENT_PUBLISHER } from '../../tokens';
import type { IJobRequestsPublisher } from './interfaces/job-requests-publisher.interface';

// Thin adapter over the shared @app/kafka-client publisher — Gateway's Application layer only
// ever sees the narrower IJobRequestsPublisher ("publish this job request"), not the generic
// IEventPublisher, so this class exists to pin the topic/key rather than have JobsProxyService
// know Kafka topic names directly. It used to own its own Kafka/Producer instance directly; now
// it just delegates, same as every other service's Kafka producer.
@Injectable()
export class KafkaJobRequestsPublisher implements IJobRequestsPublisher {
  constructor(
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async publish(message: JobRequestsMessage): Promise<void> {
    await this.eventPublisher.publish(
      KAFKA_TOPICS.JOB_REQUESTS,
      message.user_id,
      message,
    );
  }
}

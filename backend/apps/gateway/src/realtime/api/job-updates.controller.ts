import { Controller, Inject, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import {
  KAFKA_TOPICS,
  type JobCreatedMessage,
  type ResultSavedMessage,
} from '@app/kafka-contracts';
import { REALTIME_CONNECTION_SERVICE } from '../../tokens';
import type { IRealtimeConnectionService } from '../application/interfaces/realtime-connection.interface';

/**
 * API layer Kafka consumer.
 * Subscribes to `job-created` and `result-saved` events and pushes unified `message`
 * events over WebSocket to the matching connected user socket.
 */
@Controller()
export class JobUpdatesController {
  private readonly logger = new Logger(JobUpdatesController.name);

  constructor(
    @Inject(REALTIME_CONNECTION_SERVICE)
    private readonly connectionService: IRealtimeConnectionService,
  ) {}

  @EventPattern(KAFKA_TOPICS.JOB_CREATED)
  async handleJobCreated(@Payload() message: JobCreatedMessage): Promise<void> {
    this.logger.log(
      `Received job-created event for job_id=${message.job_id} user_id=${message.user_id}`,
    );

    const pushed = this.connectionService.pushToUser(message.user_id, {
      type: 'job.created',
      job_id: message.job_id,
      user_id: message.user_id,
      url: message.url,
      query: message.query,
    });

    if (!pushed) {
      this.logger.debug(
        `User ${message.user_id} not connected via WS; job.created push skipped`,
      );
    }
  }

  @EventPattern(KAFKA_TOPICS.RESULT_SAVED)
  async handleResultSaved(
    @Payload() message: ResultSavedMessage,
  ): Promise<void> {
    this.logger.log(
      `Received result-saved event for job_id=${message.job_id} user_id=${message.user_id}`,
    );

    const pushed = this.connectionService.pushToUser(message.user_id, {
      type: 'job.completed',
      job_id: message.job_id,
      result: message.result,
    });

    if (!pushed) {
      this.logger.debug(
        `User ${message.user_id} not connected via WS; job.completed push skipped`,
      );
    }
  }
}

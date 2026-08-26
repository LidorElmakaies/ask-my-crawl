import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  KAFKA_TOPICS,
  type AnswerReadyMessage,
  type ResultSavedMessage,
} from '@app/kafka-contracts';
import { EVENT_PUBLISHER, JOB_REPOSITORY } from '../tokens';
import type { IEventPublisher } from '../infrastructure/interfaces/event-publisher.interface';
import type { IJobRepository } from '../infrastructure/interfaces/job-repository.interface';
import type { ISaveJobResultUseCase } from './interfaces/save-job-result-use-case.interface';

@Injectable()
export class SaveJobResultService implements ISaveJobResultUseCase {
  private readonly logger = new Logger(SaveJobResultService.name);

  constructor(
    @Inject(JOB_REPOSITORY) private readonly jobRepository: IJobRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async handle(input: AnswerReadyMessage): Promise<void> {
    const job = await this.jobRepository.saveResult(
      input.job_id,
      input.answer_text,
    );

    if (!job) {
      // No dedicated DLQ topic exists in this design (same discipline as the Scraper/Indexer's
      // retry handling) — nothing sensible to publish for a job that doesn't exist, so just log
      // and return without producing result-saved.
      this.logger.warn(
        `answer-ready received for unknown job_id=${input.job_id} — no jobs row updated, skipping result-saved`,
      );
      return;
    }

    const resultSavedMessage: ResultSavedMessage = {
      job_id: job.id,
      user_id: job.user_id,
      // job.result is guaranteed non-null here — saveResult just wrote it.
      result: job.result as string,
    };
    await this.eventPublisher.publish(
      KAFKA_TOPICS.RESULT_SAVED,
      job.user_id,
      resultSavedMessage,
    );
  }
}

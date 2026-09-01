import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KAFKA_TOPICS, type CrawlCompleteMessage } from '@app/kafka-contracts';
import type { IEventPublisher } from '@app/kafka-client';
import { EVENT_PUBLISHER, JOB_REPOSITORY } from '../tokens';
import type { IJobRepository } from '../infrastructure/interfaces/job-repository.interface';
import type {
  IRetryJobUseCase,
  RetryJobCommand,
} from './interfaces/retry-job-use-case.interface';

@Injectable()
export class RetryJobService implements IRetryJobUseCase {
  constructor(
    @Inject(JOB_REPOSITORY) private readonly jobRepository: IJobRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async handle(command: RetryJobCommand): Promise<void> {
    const job = await this.jobRepository.findById(command.jobId);
    if (!job) {
      throw new NotFoundException(`Job with ID ${command.jobId} not found`);
    }

    if (command.role !== 'admin' && job.user_id !== command.userId) {
      throw new ForbiddenException('You do not have access to this job');
    }

    if (job.failed_reason === null) {
      throw new ConflictException('Job has no failure to retry');
    }

    await this.jobRepository.clearFailureForRetry(job.id);

    const message: CrawlCompleteMessage = {
      job_id: job.id,
      user_id: job.user_id,
      url: job.url,
      query: job.query,
      succeeded_count: 0,
      failed_count: 0,
      succeeded_urls: [],
      failed_urls: [],
      retry_count: 0,
    };
    await this.eventPublisher.publish(
      KAFKA_TOPICS.CRAWL_COMPLETE,
      job.id,
      message,
    );
  }
}

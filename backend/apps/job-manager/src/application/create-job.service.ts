import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  KAFKA_TOPICS,
  MAX_CRAWL_DEPTH,
  type CrawlFrontierMessage,
  type JobCreatedMessage,
  type JobRequestsMessage,
} from '@app/kafka-contracts';
import { EVENT_PUBLISHER, JOB_REPOSITORY } from '../tokens';
import type { IEventPublisher } from '@app/kafka-client';
import type { IJobRepository } from '../infrastructure/interfaces/job-repository.interface';
import type { ICreateJobUseCase } from './interfaces/create-job-use-case.interface';

@Injectable()
export class CreateJobService implements ICreateJobUseCase {
  constructor(
    @Inject(JOB_REPOSITORY) private readonly jobRepository: IJobRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async handle(input: JobRequestsMessage): Promise<void> {
    const job = await this.jobRepository.create({
      user_id: input.user_id,
      url: input.url,
      query: input.query,
    });

    // Seed the crawl BFS before announcing job_id — services.md's stated publish order.
    // base_url == url on the seed message — the Scraper copies it through unchanged on every
    // child it re-publishes (same propagate-only pattern as query), so it never needs to be
    // fetched again after this one message. See crawl-frontier-message.ts's own doc comment.
    const crawlFrontierMessage: CrawlFrontierMessage = {
      job_id: job.id,
      user_id: job.user_id,
      url: job.url,
      depth: MAX_CRAWL_DEPTH,
      query: job.query,
      base_url: job.url,
    };
    await this.eventPublisher.publish(
      KAFKA_TOPICS.CRAWL_FRONTIER,
      this.urlHash(job.url),
      crawlFrontierMessage,
    );

    const jobCreatedMessage: JobCreatedMessage = {
      job_id: job.id,
      user_id: job.user_id,
      url: job.url,
      query: job.query,
    };
    await this.eventPublisher.publish(
      KAFKA_TOPICS.JOB_CREATED,
      job.id,
      jobCreatedMessage,
    );
  }

  // The crawl-frontier partition key is url_hash (event-schemas.md) — a small local helper here
  // since the seed producer hashes the raw URL; whatever consumes crawl-frontier normalizes on
  // receipt, not before.
  private urlHash(url: string): string {
    return createHash('sha256').update(url).digest('hex');
  }
}

import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { PageScrapedMessage } from '@app/kafka-contracts';
import { JOB_KEY_TTL_SECONDS } from '../../models/constants';
import type { IIndexPageQueue } from '../interfaces/index-page-queue.interface';

// Mirrors the Scraper's BullMqProcessUrlQueue. Module owns the connection lifecycle; this class
// only enqueues.
@Injectable()
export class BullMqIndexPageQueue implements IIndexPageQueue {
  private readonly maxAttempts: number;

  constructor(
    @InjectQueue('index-page')
    private readonly queue: Queue<PageScrapedMessage>,
    config: ConfigService,
  ) {
    this.maxAttempts = Number(
      config.get<string>('INDEXER_MAX_ATTEMPTS') ?? '3',
    );
  }

  async alreadyClaimed(jobId: string, normalizedUrl: string): Promise<boolean> {
    const job = await this.queue.getJob(this.jobIdFor(jobId, normalizedUrl));
    return job !== undefined;
  }

  async enqueue(data: PageScrapedMessage): Promise<void> {
    await this.queue.add('index-page', data, {
      jobId: this.jobIdFor(data.job_id, data.normalizedUrl),
      // A permanent failure bypasses this via UnrecoverableError — see IndexingWorker.
      attempts: this.maxAttempts,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: JOB_KEY_TTL_SECONDS },
      removeOnFail: { age: JOB_KEY_TTL_SECONDS },
    });
  }

  private jobIdFor(jobId: string, normalizedUrl: string): string {
    return createHash('sha256')
      .update(`${jobId}:${normalizedUrl}`)
      .digest('hex');
  }
}

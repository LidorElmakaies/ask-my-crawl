import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { CrawlFrontierMessage } from '@app/kafka-contracts';
import { JOB_KEY_TTL_SECONDS } from '../../models/constants';
import { sha256Hex } from '../../models/url';
import type { IProcessUrlQueue } from '../interfaces/process-url-queue.interface';

// Module owns the connection lifecycle; this class only enqueues.
@Injectable()
export class BullMqProcessUrlQueue implements IProcessUrlQueue {
  private readonly maxAttempts: number;

  constructor(
    @InjectQueue('process-url')
    private readonly queue: Queue<CrawlFrontierMessage>,
    config: ConfigService,
  ) {
    this.maxAttempts = Number(
      config.get<string>('SCRAPER_FETCH_MAX_ATTEMPTS') ?? '3',
    );
  }

  async alreadyClaimed(jobId: string, url: string): Promise<boolean> {
    const job = await this.queue.getJob(this.jobIdFor(jobId, url));
    return job !== undefined;
  }

  async enqueue(data: CrawlFrontierMessage): Promise<void> {
    await this.queue.add('process-url', data, {
      jobId: this.jobIdFor(data.job_id, data.url),
      // A permanent failure bypasses this via UnrecoverableError — see ProcessUrlWorker.
      attempts: this.maxAttempts,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: JOB_KEY_TTL_SECONDS },
      removeOnFail: { age: JOB_KEY_TTL_SECONDS },
    });
  }

  private jobIdFor(jobId: string, url: string): string {
    return sha256Hex(`${jobId}:${url}`);
  }
}

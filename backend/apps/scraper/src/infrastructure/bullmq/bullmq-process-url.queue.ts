import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { CrawlFrontierMessage } from '@app/kafka-contracts';
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

  async enqueue(data: CrawlFrontierMessage): Promise<void> {
    await this.queue.add('process-url', data, {
      // A permanent failure bypasses this via UnrecoverableError — see ProcessUrlWorker.
      attempts: this.maxAttempts,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }
}

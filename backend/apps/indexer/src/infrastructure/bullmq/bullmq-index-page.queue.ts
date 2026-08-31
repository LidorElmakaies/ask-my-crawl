import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { PageScrapedMessage } from '@app/kafka-contracts';
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

  async enqueue(data: PageScrapedMessage): Promise<void> {
    await this.queue.add('index-page', data, {
      // A permanent failure bypasses this via UnrecoverableError — see IndexingWorker.
      attempts: this.maxAttempts,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { PageScrapedMessage } from '@app/kafka-contracts';
import type { IIndexPageQueue } from '../interfaces/index-page-queue.interface';

// @nestjs/bullmq's Queue injection (BullModule.registerQueue({name: 'index-page'}) in
// indexer.module.ts) — the module owns the connection lifecycle, this class only enqueues.
// Mirrors the Scraper's BullMqProcessUrlQueue exactly.
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
      // Only transient failures actually consume these — a permanent failure throws bullmq's own
      // UnrecoverableError instead (see IndexingWorker). Exponential backoff, 5s base, same shape
      // as the Scraper's process-url queue.
      attempts: this.maxAttempts,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { CrawlFrontierMessage } from '@app/kafka-contracts';
import type { IProcessUrlQueue } from '../interfaces/process-url-queue.interface';

// @nestjs/bullmq's Queue injection (BullModule.registerQueue({name: 'process-url'}) in
// scraper.module.ts) — the module owns the connection lifecycle, this class only enqueues.
// Enqueuing is an outbound side effect (backend-architecture.md's BullMQ rule) — Application code
// only ever sees IProcessUrlQueue.
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
      // Only transient failures actually consume these — a permanent failure throws bullmq's own
      // UnrecoverableError instead (see ProcessUrlWorker), which bypasses this regardless of the
      // count. Exponential backoff, 5s base. See docs/planning/03-crawler-scraper-indexing-plan.md
      // §5/§10 — the attempt count is env-configurable (SCRAPER_FETCH_MAX_ATTEMPTS), the backoff
      // shape isn't (cheap to change later, not asked to be configurable).
      attempts: this.maxAttempts,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }
}

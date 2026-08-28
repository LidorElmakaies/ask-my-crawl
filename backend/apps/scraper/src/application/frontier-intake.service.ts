import { Inject, Injectable } from '@nestjs/common';
import type { CrawlFrontierMessage } from '@app/kafka-contracts';
import { COORDINATION_STORE, PROCESS_URL_QUEUE } from '../tokens';
import { stripFragment } from '../models/url';
import type { ICoordinationStore } from '../infrastructure/interfaces/coordination-store.interface';
import type { IProcessUrlQueue } from '../infrastructure/interfaces/process-url-queue.interface';
import type { IFrontierIntakeUseCase } from './interfaces/frontier-intake-use-case.interface';

// Frontier Consumer's use case — the single authoritative dedup gate. Handles both the seed
// message (from Job Manager Service) and every child URL the Scraper Worker re-publishes, on the
// same crawl-frontier topic. See docs/planning/03-crawler-scraper-indexing-plan.md §4.
@Injectable()
export class FrontierIntakeService implements IFrontierIntakeUseCase {
  constructor(
    @Inject(COORDINATION_STORE)
    private readonly coordinationStore: ICoordinationStore,
    @Inject(PROCESS_URL_QUEUE) private readonly queue: IProcessUrlQueue,
  ) {}

  async handle(message: CrawlFrontierMessage): Promise<void> {
    const url = stripFragment(message.url);

    const isNew = await this.coordinationStore.tryMarkVisited(
      message.job_id,
      url,
    );
    if (!isNew) {
      // Redelivery of an already-seen URL (Kafka at-least-once, a consumer restart, ...) — the
      // dedup gate makes this a harmless no-op, not an error.
      return;
    }

    await this.coordinationStore.incrementPendingScrape(message.job_id);
    await this.queue.enqueue({ ...message, url });
  }
}

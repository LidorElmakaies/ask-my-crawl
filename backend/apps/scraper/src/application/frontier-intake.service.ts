import { Inject, Injectable } from '@nestjs/common';
import type { CrawlFrontierMessage } from '@app/kafka-contracts';
import { COORDINATION_STORE, PROCESS_URL_QUEUE } from '../tokens';
import { stripFragment } from '../models/url';
import type { ICoordinationStore } from '../infrastructure/interfaces/coordination-store.interface';
import type { IProcessUrlQueue } from '../infrastructure/interfaces/process-url-queue.interface';
import type { IFrontierIntakeUseCase } from './interfaces/frontier-intake-use-case.interface';

// The single authoritative dedup gate — handles both the seed message and every re-published
// child URL. See docs/planning/03-crawler-scraper-indexing-plan.md §4.
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
    if (!isNew) return; // redelivery of an already-seen URL — harmless no-op

    await this.coordinationStore.incrementPendingScrape(message.job_id);
    await this.queue.enqueue({ ...message, url });
  }
}

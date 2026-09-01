import { Inject, Injectable } from '@nestjs/common';
import type { PageScrapedMessage } from '@app/kafka-contracts';
import { COORDINATION_STORE, INDEX_PAGE_QUEUE } from '../tokens';
import type { ICoordinationStore } from '../infrastructure/interfaces/coordination-store.interface';
import type { IIndexPageQueue } from '../infrastructure/interfaces/index-page-queue.interface';
import type { IIndexIntakeUseCase } from './interfaces/index-intake-use-case.interface';

// Bridges page-scraped onto the index-page BullMQ queue. See
// docs/planning/03-crawler-scraper-indexing-plan.md §7.
@Injectable()
export class IndexIntakeService implements IIndexIntakeUseCase {
  constructor(
    @Inject(COORDINATION_STORE)
    private readonly coordinationStore: ICoordinationStore,
    @Inject(INDEX_PAGE_QUEUE) private readonly queue: IIndexPageQueue,
  ) {}

  async handle(message: PageScrapedMessage): Promise<void> {
    const alreadyClaimed = await this.queue.alreadyClaimed(
      message.job_id,
      message.normalizedUrl,
    );
    if (alreadyClaimed) return;

    await this.coordinationStore.addPendingIndex(
      message.job_id,
      message.normalizedUrl,
    );
    await this.queue.enqueue(message);
  }
}

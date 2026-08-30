import { Inject, Injectable } from '@nestjs/common';
import type { PageScrapedMessage } from '@app/kafka-contracts';
import { COORDINATION_STORE, INDEX_PAGE_QUEUE } from '../tokens';
import type { ICoordinationStore } from '../infrastructure/interfaces/coordination-store.interface';
import type { IIndexPageQueue } from '../infrastructure/interfaces/index-page-queue.interface';
import type { IIndexIntakeUseCase } from './interfaces/index-intake-use-case.interface';

// Index Intake Consumer's use case — bridges page-scraped onto the index-page BullMQ queue,
// mirroring the Scraper's FrontierIntakeService. No dedup gate here, unlike FrontierIntakeService:
// each page-scraped message already represents one successfully-scraped page (the Scraper Worker
// publishes it exactly once per page it saves), not a URL that might be rediscovered many times
// the way crawl-frontier's are. At-least-once Kafka redelivery of the same page-scraped message
// would still double-INCR pending_index and double-enqueue — a known, unsolved POC-level gap, not
// addressed here (see docs/planning/03-crawler-scraper-indexing-plan.md §7).
@Injectable()
export class IndexIntakeService implements IIndexIntakeUseCase {
  constructor(
    @Inject(COORDINATION_STORE)
    private readonly coordinationStore: ICoordinationStore,
    @Inject(INDEX_PAGE_QUEUE) private readonly queue: IIndexPageQueue,
  ) {}

  async handle(message: PageScrapedMessage): Promise<void> {
    await this.coordinationStore.incrementPendingIndex(message.job_id);
    await this.queue.enqueue(message);
  }
}

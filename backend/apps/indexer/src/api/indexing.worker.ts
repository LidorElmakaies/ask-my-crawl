import { Inject, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import type { PageScrapedMessage } from '@app/kafka-contracts';
import { INDEXING_USE_CASE } from '../tokens';
import { PermanentIndexError } from '../models/permanent-index-error';
import type { IIndexingUseCase } from '../application/interfaces/indexing-use-case.interface';

// Mirrors the Scraper's ProcessUrlWorker, including the finality check — see IIndexingUseCase's
// doc comment for why finalizeIndex() is called from the event handlers, not process().
@Processor('index-page')
export class IndexingWorker extends WorkerHost {
  private readonly logger = new Logger(IndexingWorker.name);

  constructor(
    @Inject(INDEXING_USE_CASE) private readonly useCase: IIndexingUseCase,
  ) {
    super();
  }

  async process(job: Job<PageScrapedMessage>): Promise<void> {
    try {
      await this.useCase.handle(job.data);
    } catch (err) {
      if (err instanceof PermanentIndexError) {
        throw new UnrecoverableError(err.message);
      }
      throw err; // transient — let BullMQ's attempts/backoff retry it
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<PageScrapedMessage>): void {
    void this.useCase.finalizeIndex(job.data, 'succeeded');
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<PageScrapedMessage> | undefined, err: Error): void {
    if (!job) return;
    this.logger.warn(
      `index-page attempt failed for job_id=${job.data.job_id} url=${job.data.normalizedUrl}: ${err.message}`,
    );
    // 'failed' fires on every attempt, not just the final one.
    const attemptsMade = job.attemptsMade;
    const maxAttemptsForJob = job.opts.attempts ?? 1;
    const isFinal =
      err instanceof UnrecoverableError || attemptsMade >= maxAttemptsForJob;
    if (isFinal) {
      void this.useCase.finalizeIndex(job.data, 'failed');
    }
  }
}

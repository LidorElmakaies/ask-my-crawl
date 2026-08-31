import { Inject } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import type { CrawlFrontierMessage } from '@app/kafka-contracts';
import { PROCESS_URL_USE_CASE } from '../tokens';
import { PermanentFetchError } from '../models/permanent-fetch-error';
import type { IProcessUrlUseCase } from '../application/interfaces/process-url-use-case.interface';

// See IProcessUrlUseCase's doc comment for why finalizeUrl() is called from the
// 'completed'/'failed' event handlers, not from process().
@Processor('process-url')
export class ProcessUrlWorker extends WorkerHost {
  constructor(
    @Inject(PROCESS_URL_USE_CASE) private readonly useCase: IProcessUrlUseCase,
  ) {
    super();
  }

  async process(job: Job<CrawlFrontierMessage>): Promise<void> {
    try {
      await this.useCase.handle(job.data);
    } catch (err) {
      if (err instanceof PermanentFetchError) {
        throw new UnrecoverableError(err.message);
      }
      throw err; // transient — let BullMQ's attempts/backoff retry it
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<CrawlFrontierMessage>): void {
    void this.useCase.finalizeUrl(job.data, 'succeeded');
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<CrawlFrontierMessage> | undefined, err: Error): void {
    if (!job) return;
    // 'failed' fires on every attempt, not just the final one.
    const attemptsMade = job.attemptsMade;
    const maxAttemptsForJob = job.opts.attempts ?? 1;
    const isFinal =
      err instanceof UnrecoverableError || attemptsMade >= maxAttemptsForJob;
    if (isFinal) {
      void this.useCase.finalizeUrl(job.data, 'failed');
    }
  }
}

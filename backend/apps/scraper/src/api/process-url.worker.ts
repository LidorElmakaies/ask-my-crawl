import { Inject } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import type { CrawlFrontierMessage } from '@app/kafka-contracts';
import { PROCESS_URL_USE_CASE } from '../tokens';
import { PermanentFetchError } from '../models/permanent-fetch-error';
import type { IProcessUrlUseCase } from '../application/interfaces/process-url-use-case.interface';

// The `process-url` BullMQ worker — an inbound trigger, same tier as a Kafka @EventPattern
// consumer (backend-architecture.md's "applies beyond HTTP" section). @nestjs/bullmq's
// WorkerHost + @OnWorkerEvent give direct access to the 'completed'/'failed' lifecycle events —
// see IProcessUrlUseCase's doc comment for why finalizeUrl() has to be called from there and not
// from process() itself.
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
        // bullmq's own "don't retry this job" mechanism — translates our framework-agnostic
        // domain error into a bullmq-specific one, exactly at this API boundary. Application
        // stays ignorant of BullMQ, per backend-architecture.md.
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
    // bullmq's 'failed' event fires on EVERY attempt, not just the final one
    // (docs.bullmq.io/guide/retrying-failing-jobs) — verified before relying on it, not assumed.
    // An UnrecoverableError always means final (it bypasses the attempts count entirely);
    // otherwise only finalize once attemptsMade has actually reached the configured limit.
    // Getting this wrong either double-decrements pending_scrape (finalizing on attempt 1 of 3)
    // or hangs the job forever (never finalizing a truly-exhausted job).
    const attemptsMade = job.attemptsMade;
    const maxAttemptsForJob = job.opts.attempts ?? 1;
    const isFinal =
      err instanceof UnrecoverableError || attemptsMade >= maxAttemptsForJob;
    if (isFinal) {
      void this.useCase.finalizeUrl(job.data, 'failed');
    }
  }
}

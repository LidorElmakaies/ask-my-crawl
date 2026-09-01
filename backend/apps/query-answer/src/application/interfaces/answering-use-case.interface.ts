import type { CrawlCompleteMessage } from '@app/kafka-contracts';

/** Implemented by AnsweringService. Consumed by CrawlCompleteConsumer. */
export interface IAnsweringUseCase {
  /** Embed the query, retrieve the job's chunks from Qdrant, prompt the LLM, and publish
   * answer-ready. On transient failure, retries by republishing crawl-complete; on
   * PermanentAnswerError or retry exhaustion, publishes answer-ready with failed_reason set. */
  handle(message: CrawlCompleteMessage): Promise<void>;
}

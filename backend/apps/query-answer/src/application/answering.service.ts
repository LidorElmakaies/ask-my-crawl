import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  KAFKA_TOPICS,
  type AnswerReadyMessage,
  type CrawlCompleteMessage,
} from '@app/kafka-contracts';
import type { IEventPublisher } from '@app/kafka-client';
import {
  EMBEDDING_CLIENT,
  EVENT_PUBLISHER,
  LLM_CLIENT,
  VECTOR_RETRIEVER,
} from '../tokens';
import {
  ANSWER_MAX_RETRIES,
  ANSWER_RETRY_BACKOFF_BASE_MS,
  ANSWER_RETRY_BACKOFF_CAP_MS,
} from '../models/constants';
import { PermanentAnswerError } from '../models/permanent-answer-error';
import type { IEmbeddingClient } from '../infrastructure/interfaces/embedding-client.interface';
import type {
  IVectorRetriever,
  RetrievedChunk,
} from '../infrastructure/interfaces/vector-retriever.interface';
import type { ILlmClient } from '../infrastructure/interfaces/llm-client.interface';
import type { IAnsweringUseCase } from './interfaces/answering-use-case.interface';

const SYSTEM_PROMPT =
  'You are an assistant answering questions about the content of web pages that were crawled ' +
  'for the user. Answer ONLY using the provided context below — never use outside knowledge, ' +
  "and never make anything up. If the context doesn't contain enough information to answer the " +
  'question, say so honestly instead of guessing.';

@Injectable()
export class AnsweringService implements IAnsweringUseCase {
  private readonly logger = new Logger(AnsweringService.name);

  constructor(
    @Inject(EMBEDDING_CLIENT)
    private readonly embeddingClient: IEmbeddingClient,
    @Inject(VECTOR_RETRIEVER)
    private readonly vectorRetriever: IVectorRetriever,
    @Inject(LLM_CLIENT) private readonly llmClient: ILlmClient,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async handle(message: CrawlCompleteMessage): Promise<void> {
    try {
      const [queryVector] = await this.embeddingClient.embed([message.query]);
      const chunks = await this.vectorRetriever.search(
        queryVector,
        message.job_id,
      );

      const userPrompt = this.buildUserPrompt(message.query, chunks);
      const answerText = await this.llmClient.generateAnswer(
        SYSTEM_PROMPT,
        userPrompt,
      );

      await this.publishAnswerReady(message, answerText, null);
    } catch (err) {
      await this.handleFailure(message, err as Error);
    }
  }

  private async handleFailure(
    message: CrawlCompleteMessage,
    err: Error,
  ): Promise<void> {
    if (err instanceof PermanentAnswerError) {
      this.logger.warn(
        `Answering permanently failed for job_id=${message.job_id}: ${err.message}`,
      );
      await this.publishAnswerReady(message, null, err.message);
      return;
    }

    const nextRetryCount = message.retry_count + 1;
    if (nextRetryCount <= ANSWER_MAX_RETRIES) {
      const backoffMs = Math.min(
        ANSWER_RETRY_BACKOFF_BASE_MS * 2 ** message.retry_count,
        ANSWER_RETRY_BACKOFF_CAP_MS,
      );
      this.logger.warn(
        `Answering attempt ${message.retry_count + 1} failed for job_id=${message.job_id}: ${err.message} — retrying in ${backoffMs}ms`,
      );
      await this.sleep(backoffMs);
      await this.eventPublisher.publish(
        KAFKA_TOPICS.CRAWL_COMPLETE,
        message.job_id,
        {
          ...message,
          retry_count: nextRetryCount,
        },
      );
      return;
    }

    this.logger.warn(
      `Answering gave up for job_id=${message.job_id} after ${nextRetryCount} attempts: ${err.message}`,
    );
    await this.publishAnswerReady(
      message,
      null,
      `Failed after ${nextRetryCount} attempts: ${err.message}`,
    );
  }

  private async publishAnswerReady(
    message: CrawlCompleteMessage,
    answerText: string | null,
    failedReason: string | null,
  ): Promise<void> {
    const answerReady: AnswerReadyMessage = {
      job_id: message.job_id,
      user_id: message.user_id,
      answer_text: answerText,
      failed_reason: failedReason,
    };
    await this.eventPublisher.publish(
      KAFKA_TOPICS.ANSWER_READY,
      message.job_id,
      answerReady,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private buildUserPrompt(query: string, chunks: RetrievedChunk[]): string {
    if (chunks.length === 0) {
      return (
        'No content was retrieved from the crawl for this question — the crawl may have failed ' +
        'to index any pages, or nothing relevant was found.\n\n' +
        `Question: ${query}`
      );
    }

    const context = chunks
      .map((chunk, i) => `[${i + 1}] (source: ${chunk.url})\n${chunk.text}`)
      .join('\n\n');

    return `Context from the crawled pages:\n\n${context}\n\nQuestion: ${query}`;
  }
}

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
  LEXICAL_RETRIEVER,
  LLM_CLIENT,
  QUERY_EXPANDER,
  VECTOR_RETRIEVER,
} from '../tokens';
import {
  ANSWER_MAX_RETRIES,
  ANSWER_RETRY_BACKOFF_BASE_MS,
  ANSWER_RETRY_BACKOFF_CAP_MS,
  FUSION_TOP_K_PER_MODALITY,
} from '../models/constants';
import { PermanentAnswerError } from '../models/permanent-answer-error';
import type { RetrievedChunk } from '../models/retrieved-chunk';
import { reciprocalRankFusion } from '../utils/reciprocal-rank-fusion';
import { dedupeChunks } from '../utils/chunk-utils';
import {
  ANSWERING_SYSTEM_PROMPT,
  buildAnsweringUserPrompt,
} from '../utils/prompts';
import type { IEmbeddingClient } from '../infrastructure/interfaces/embedding-client.interface';
import type { IVectorRetriever } from '../infrastructure/interfaces/vector-retriever.interface';
import type { ILexicalRetriever } from '../infrastructure/interfaces/lexical-retriever.interface';
import type { ILlmClient } from '../infrastructure/interfaces/llm-client.interface';
import type { IQueryExpander } from '../infrastructure/interfaces/query-expander.interface';
import type { IAnsweringUseCase } from './interfaces/answering-use-case.interface';

@Injectable()
export class AnsweringService implements IAnsweringUseCase {
  private readonly logger = new Logger(AnsweringService.name);

  constructor(
    @Inject(QUERY_EXPANDER) private readonly queryExpander: IQueryExpander,
    @Inject(EMBEDDING_CLIENT)
    private readonly embeddingClient: IEmbeddingClient,
    @Inject(VECTOR_RETRIEVER)
    private readonly vectorRetriever: IVectorRetriever,
    @Inject(LEXICAL_RETRIEVER)
    private readonly lexicalRetriever: ILexicalRetriever,
    @Inject(LLM_CLIENT) private readonly llmClient: ILlmClient,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async handle(message: CrawlCompleteMessage): Promise<void> {
    try {
      const queries = await this.queryExpander.expand(message.query);
      const chunks = await this.retrieveChunks(queries, message.job_id);

      const userPrompt = buildAnsweringUserPrompt(message.query, chunks);
      const answerText = await this.llmClient.generateAnswer(
        ANSWERING_SYSTEM_PROMPT,
        userPrompt,
      );

      await this.publishAnswerReady(message, answerText, null);
    } catch (err) {
      await this.handleFailure(message, err as Error);
    }
  }

  // Two-stage RRF: dense and lexical modalities are fused separately, then merged+deduped. See
  // docs/planning/04-retrieval-quality-plan.md.
  private async retrieveChunks(
    queries: string[],
    jobId: string,
  ): Promise<RetrievedChunk[]> {
    const [denseLists, lexicalLists] = await Promise.all([
      this.searchDense(queries, jobId),
      this.lexicalRetriever.searchMany(queries, jobId),
    ]);

    const fusedDense = reciprocalRankFusion(denseLists).slice(
      0,
      FUSION_TOP_K_PER_MODALITY,
    );
    const fusedLexical = reciprocalRankFusion(lexicalLists).slice(
      0,
      FUSION_TOP_K_PER_MODALITY,
    );

    return dedupeChunks([...fusedDense, ...fusedLexical]);
  }

  private async searchDense(
    queries: string[],
    jobId: string,
  ): Promise<RetrievedChunk[][]> {
    const vectors = await this.embeddingClient.embed(queries);
    return Promise.all(
      vectors.map((vector) => this.vectorRetriever.search(vector, jobId)),
    );
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
}

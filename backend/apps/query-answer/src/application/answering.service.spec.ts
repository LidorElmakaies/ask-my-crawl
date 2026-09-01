/* eslint-disable @typescript-eslint/unbound-method --
   false positive: these are jest.fn() mocks, not real prototype methods relying on `this`. */
import { KAFKA_TOPICS, type CrawlCompleteMessage } from '@app/kafka-contracts';
import type { IEventPublisher } from '@app/kafka-client';
import type { IEmbeddingClient } from '../infrastructure/interfaces/embedding-client.interface';
import type { IVectorRetriever } from '../infrastructure/interfaces/vector-retriever.interface';
import type { ILlmClient } from '../infrastructure/interfaces/llm-client.interface';
import { PermanentAnswerError } from '../models/permanent-answer-error';
import { ANSWER_MAX_RETRIES } from '../models/constants';
import { AnsweringService } from './answering.service';

function makeDeps() {
  const embeddingClient: jest.Mocked<IEmbeddingClient> = { embed: jest.fn() };
  const vectorRetriever: jest.Mocked<IVectorRetriever> = { search: jest.fn() };
  const llmClient: jest.Mocked<ILlmClient> = { generateAnswer: jest.fn() };
  const eventPublisher: jest.Mocked<IEventPublisher> = { publish: jest.fn() };
  return { embeddingClient, vectorRetriever, llmClient, eventPublisher };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  const service = new AnsweringService(
    deps.embeddingClient,
    deps.vectorRetriever,
    deps.llmClient,
    deps.eventPublisher,
  );
  jest
    .spyOn(service as unknown as { sleep(ms: number): Promise<void> }, 'sleep')
    .mockResolvedValue(undefined);
  return service;
}

function makeMessage(
  overrides: Partial<CrawlCompleteMessage> = {},
): CrawlCompleteMessage {
  return {
    job_id: 'job-1',
    user_id: 'user-1',
    query: 'what is this page about?',
    url: 'https://example.com/',
    succeeded_count: 1,
    failed_count: 0,
    succeeded_urls: ['https://example.com/page'],
    failed_urls: [],
    retry_count: 0,
    ...overrides,
  };
}

describe('AnsweringService.handle', () => {
  it('embeds the query, retrieves chunks, prompts the LLM, and publishes answer-ready on success', async () => {
    const deps = makeDeps();
    deps.embeddingClient.embed.mockResolvedValue([[0.1, 0.2]]);
    deps.vectorRetriever.search.mockResolvedValue([
      { text: 'hello world', url: 'https://example.com/page', score: 0.9 },
    ]);
    deps.llmClient.generateAnswer.mockResolvedValue('This page says hello.');
    const service = makeService(deps);
    const message = makeMessage();

    await service.handle(message);

    expect(deps.embeddingClient.embed).toHaveBeenCalledWith([message.query]);
    expect(deps.vectorRetriever.search).toHaveBeenCalledWith(
      [0.1, 0.2],
      'job-1',
    );
    const [, userPrompt] = deps.llmClient.generateAnswer.mock.calls[0];
    expect(userPrompt).toContain('hello world');

    expect(deps.eventPublisher.publish).toHaveBeenCalledWith(
      KAFKA_TOPICS.ANSWER_READY,
      'job-1',
      {
        job_id: 'job-1',
        user_id: 'user-1',
        answer_text: 'This page says hello.',
        failed_reason: null,
      },
    );
  });

  it('republishes crawl-complete with an incremented retry_count on a transient failure under the cap', async () => {
    const deps = makeDeps();
    deps.embeddingClient.embed.mockRejectedValue(new Error('LLM unreachable'));
    const service = makeService(deps);
    const message = makeMessage({ retry_count: 1 });

    await service.handle(message);

    expect(deps.eventPublisher.publish).toHaveBeenCalledTimes(1);
    expect(deps.eventPublisher.publish).toHaveBeenCalledWith(
      KAFKA_TOPICS.CRAWL_COMPLETE,
      'job-1',
      { ...message, retry_count: 2 },
    );
  });

  it('gives up and publishes answer-ready with failed_reason once retries are exhausted', async () => {
    const deps = makeDeps();
    deps.embeddingClient.embed.mockRejectedValue(new Error('LLM unreachable'));
    const service = makeService(deps);
    const message = makeMessage({ retry_count: ANSWER_MAX_RETRIES });

    await service.handle(message);

    expect(deps.eventPublisher.publish).toHaveBeenCalledTimes(1);
    const [topic, key, payload] = deps.eventPublisher.publish.mock.calls[0];
    expect(topic).toBe(KAFKA_TOPICS.ANSWER_READY);
    expect(key).toBe('job-1');
    expect(payload).toMatchObject({
      job_id: 'job-1',
      user_id: 'user-1',
      answer_text: null,
    });
    expect((payload as { failed_reason: string }).failed_reason).toContain(
      'LLM unreachable',
    );
  });

  it('gives up immediately on a PermanentAnswerError regardless of retry_count', async () => {
    const deps = makeDeps();
    deps.embeddingClient.embed.mockRejectedValue(
      new PermanentAnswerError('dimension mismatch'),
    );
    const service = makeService(deps);
    const message = makeMessage({ retry_count: 0 });

    await service.handle(message);

    expect(deps.vectorRetriever.search).not.toHaveBeenCalled();
    expect(deps.llmClient.generateAnswer).not.toHaveBeenCalled();
    expect(deps.eventPublisher.publish).toHaveBeenCalledTimes(1);
    expect(deps.eventPublisher.publish).toHaveBeenCalledWith(
      KAFKA_TOPICS.ANSWER_READY,
      'job-1',
      {
        job_id: 'job-1',
        user_id: 'user-1',
        answer_text: null,
        failed_reason: 'dimension mismatch',
      },
    );
  });
});

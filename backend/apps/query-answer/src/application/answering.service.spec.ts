/* eslint-disable @typescript-eslint/unbound-method --
   false positive: these are jest.fn() mocks, not real prototype methods relying on `this`. */
import { KAFKA_TOPICS, type CrawlCompleteMessage } from '@app/kafka-contracts';
import type { IEventPublisher } from '@app/kafka-client';
import type { IEmbeddingClient } from '../infrastructure/interfaces/embedding-client.interface';
import type { IVectorRetriever } from '../infrastructure/interfaces/vector-retriever.interface';
import type { ILexicalRetriever } from '../infrastructure/interfaces/lexical-retriever.interface';
import type { ILlmClient } from '../infrastructure/interfaces/llm-client.interface';
import type { IQueryExpander } from '../infrastructure/interfaces/query-expander.interface';
import type { RetrievedChunk } from '../models/retrieved-chunk';
import { PermanentAnswerError } from '../models/permanent-answer-error';
import { ANSWER_MAX_RETRIES } from '../models/constants';
import { AnsweringService } from './answering.service';

function chunk(url: string, chunkIndex: number, score: number): RetrievedChunk {
  return { text: `text for ${url}#${chunkIndex}`, url, chunkIndex, score };
}

function makeDeps() {
  const queryExpander: jest.Mocked<IQueryExpander> = { expand: jest.fn() };
  const embeddingClient: jest.Mocked<IEmbeddingClient> = { embed: jest.fn() };
  const vectorRetriever: jest.Mocked<IVectorRetriever> = { search: jest.fn() };
  const lexicalRetriever: jest.Mocked<ILexicalRetriever> = {
    searchMany: jest.fn(),
  };
  const llmClient: jest.Mocked<ILlmClient> = { generateAnswer: jest.fn() };
  const eventPublisher: jest.Mocked<IEventPublisher> = { publish: jest.fn() };
  return {
    queryExpander,
    embeddingClient,
    vectorRetriever,
    lexicalRetriever,
    llmClient,
    eventPublisher,
  };
}

/** Defaults every dep to a harmless empty/no-op result, so a test only needs to override the
 * dep(s) it actually cares about. */
function withDefaults(deps: ReturnType<typeof makeDeps>) {
  deps.queryExpander.expand.mockResolvedValue(['q0', 'q1', 'q2']);
  deps.embeddingClient.embed.mockResolvedValue([[0.1], [0.2], [0.3]]);
  deps.vectorRetriever.search.mockResolvedValue([]);
  deps.lexicalRetriever.searchMany.mockResolvedValue([[], [], []]);
  return deps;
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  const service = new AnsweringService(
    deps.queryExpander,
    deps.embeddingClient,
    deps.vectorRetriever,
    deps.lexicalRetriever,
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
  it('expands the query, embeds every variant, retrieves chunks, prompts the LLM, and publishes answer-ready on success', async () => {
    const deps = withDefaults(makeDeps());
    deps.queryExpander.expand.mockResolvedValue([
      'original query',
      'rewrite one',
      'rewrite two',
    ]);
    deps.vectorRetriever.search.mockResolvedValue([
      chunk('https://example.com/page', 0, 0.9),
    ]);
    deps.llmClient.generateAnswer.mockResolvedValue('This page says hello.');
    const service = makeService(deps);
    const message = makeMessage({ query: 'original query' });

    await service.handle(message);

    expect(deps.queryExpander.expand).toHaveBeenCalledWith('original query');
    expect(deps.embeddingClient.embed).toHaveBeenCalledWith([
      'original query',
      'rewrite one',
      'rewrite two',
    ]);
    expect(deps.vectorRetriever.search).toHaveBeenCalledTimes(3);
    expect(deps.lexicalRetriever.searchMany).toHaveBeenCalledWith(
      ['original query', 'rewrite one', 'rewrite two'],
      'job-1',
    );

    const [, userPrompt] = deps.llmClient.generateAnswer.mock.calls[0];
    expect(userPrompt).toContain('text for https://example.com/page#0');

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

  it('fuses dense and lexical results via RRF, keeping the top 5 of each and deduping overlaps', async () => {
    const deps = withDefaults(makeDeps());
    const chunkA = chunk('https://example.com/a', 0, 0.8);
    const chunkB = chunk('https://example.com/b', 0, 0.7);
    deps.vectorRetriever.search.mockResolvedValue([chunkA, chunkB]);
    deps.lexicalRetriever.searchMany.mockResolvedValue([
      [chunkA],
      [chunkA],
      [chunkA],
    ]);
    deps.llmClient.generateAnswer.mockResolvedValue('answer');
    const service = makeService(deps);

    await service.handle(makeMessage());

    const [, userPrompt] = deps.llmClient.generateAnswer.mock.calls[0];
    const occurrences =
      userPrompt.split('text for https://example.com/a#0').length - 1;
    expect(occurrences).toBe(1);
    expect(userPrompt).toContain('text for https://example.com/b#0');
  });

  it('says no content was retrieved when both modalities come back empty for every variant', async () => {
    const deps = withDefaults(makeDeps());
    deps.llmClient.generateAnswer.mockResolvedValue('no answer');
    const service = makeService(deps);

    await service.handle(makeMessage({ query: 'anything' }));

    const [, userPrompt] = deps.llmClient.generateAnswer.mock.calls[0];
    expect(userPrompt).toContain('No content was retrieved from the crawl');
    expect(userPrompt).toContain('Question: anything');
  });

  it('republishes crawl-complete with an incremented retry_count on a transient failure under the cap', async () => {
    const deps = withDefaults(makeDeps());
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
    const deps = withDefaults(makeDeps());
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
    const deps = withDefaults(makeDeps());
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

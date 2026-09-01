/* eslint-disable @typescript-eslint/unbound-method --
   false positive: these are jest.fn() mocks, not real prototype methods relying on `this`. */
import { KAFKA_TOPICS, type PageScrapedMessage } from '@app/kafka-contracts';
import type { IEventPublisher } from '@app/kafka-client';
import type { IBlobRepository } from '../infrastructure/interfaces/blob-repository.interface';
import type { IChunker } from '../infrastructure/interfaces/chunker.interface';
import type { ICoordinationStore } from '../infrastructure/interfaces/coordination-store.interface';
import type { IEmbeddingClient } from '../infrastructure/interfaces/embedding-client.interface';
import type { ITextExtractor } from '../infrastructure/interfaces/text-extractor.interface';
import type { IVectorStore } from '../infrastructure/interfaces/vector-store.interface';
import { IndexingService } from './indexing.service';

function makeDeps() {
  const blobRepository: jest.Mocked<IBlobRepository> = { get: jest.fn() };
  const textExtractor: jest.Mocked<ITextExtractor> = { extract: jest.fn() };
  const chunker: jest.Mocked<IChunker> = { split: jest.fn() };
  const embeddingClient: jest.Mocked<IEmbeddingClient> = { embed: jest.fn() };
  const vectorStore: jest.Mocked<IVectorStore> = {
    ensureCollection: jest.fn(),
    deleteByUrl: jest.fn(),
    upsert: jest.fn(),
  };
  const eventPublisher: jest.Mocked<IEventPublisher> = { publish: jest.fn() };
  const coordinationStore: jest.Mocked<ICoordinationStore> = {
    addPendingIndex: jest.fn(),
    removePendingIndex: jest.fn(),
    getCompletionUrls: jest.fn(),
    tryClaimCompletion: jest.fn(),
    expireJobKeys: jest.fn(),
  };
  return {
    blobRepository,
    textExtractor,
    chunker,
    embeddingClient,
    vectorStore,
    eventPublisher,
    coordinationStore,
  };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new IndexingService(
    deps.blobRepository,
    deps.textExtractor,
    deps.chunker,
    deps.embeddingClient,
    deps.vectorStore,
    deps.eventPublisher,
    deps.coordinationStore,
  );
}

const message: PageScrapedMessage = {
  job_id: 'job-1',
  user_id: 'user-1',
  url: 'https://example.com/page',
  normalizedUrl: 'https://example.com/page',
  blobKey: 'blob-1',
  depth: 2,
  scrapedAt: '2026-08-30T00:00:00.000Z',
  query: 'what is this page about?',
  base_url: 'https://example.com/', // deliberately different from normalizedUrl — the test below
  // asserts crawl-complete's `url` comes from THIS field, not the page's own url.
};

describe('IndexingService.handle', () => {
  it('fetches, extracts, chunks, embeds, deletes stale, and upserts with the right chunk shape', async () => {
    const deps = makeDeps();
    deps.blobRepository.get.mockResolvedValue(
      '<html><body>hello world</body></html>',
    );
    deps.textExtractor.extract.mockReturnValue('hello world');
    deps.chunker.split.mockResolvedValue(['hello', 'world']);
    deps.embeddingClient.embed.mockResolvedValue([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    const service = makeService(deps);

    await service.handle(message);

    expect(deps.blobRepository.get).toHaveBeenCalledWith('blob-1');
    expect(deps.textExtractor.extract).toHaveBeenCalledWith(
      '<html><body>hello world</body></html>',
    );
    expect(deps.vectorStore.ensureCollection).toHaveBeenCalledTimes(1);
    expect(deps.chunker.split).toHaveBeenCalledWith('hello world');
    expect(deps.embeddingClient.embed).toHaveBeenCalledWith(['hello', 'world']);
    // Delete-before-upsert, always — see IVectorStore.deleteByUrl's doc comment.
    expect(deps.vectorStore.deleteByUrl).toHaveBeenCalledWith(
      'https://example.com/page',
    );
    expect(deps.vectorStore.upsert).toHaveBeenCalledWith([
      {
        jobId: 'job-1',
        userId: 'user-1',
        url: 'https://example.com/page',
        query: 'what is this page about?',
        chunkIndex: 0,
        scrapedAt: '2026-08-30T00:00:00.000Z',
        text: 'hello',
        vector: [0.1, 0.2],
      },
      {
        jobId: 'job-1',
        userId: 'user-1',
        url: 'https://example.com/page',
        query: 'what is this page about?',
        chunkIndex: 1,
        scrapedAt: '2026-08-30T00:00:00.000Z',
        text: 'world',
        vector: [0.3, 0.4],
      },
    ]);
  });

  it('deletes stale vectors and returns without embedding when the extracted text is empty', async () => {
    const deps = makeDeps();
    deps.blobRepository.get.mockResolvedValue('<html><body></body></html>');
    deps.textExtractor.extract.mockReturnValue('   '); // whitespace-only
    const service = makeService(deps);

    await service.handle(message);

    expect(deps.chunker.split).not.toHaveBeenCalled();
    expect(deps.embeddingClient.embed).not.toHaveBeenCalled();
    expect(deps.vectorStore.deleteByUrl).toHaveBeenCalledWith(
      'https://example.com/page',
    );
    expect(deps.vectorStore.upsert).not.toHaveBeenCalled();
  });
});

describe('IndexingService.finalizeIndex', () => {
  it('does nothing further when either pending counter is still above zero', async () => {
    const deps = makeDeps();
    deps.coordinationStore.removePendingIndex.mockResolvedValue({
      pendingIndex: 0,
      pendingScrape: 1,
    });
    const service = makeService(deps);

    await service.finalizeIndex(message, 'succeeded');

    expect(deps.coordinationStore.tryClaimCompletion).not.toHaveBeenCalled();
    expect(deps.eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('does not publish when it loses the completion race', async () => {
    const deps = makeDeps();
    deps.coordinationStore.removePendingIndex.mockResolvedValue({
      pendingIndex: 0,
      pendingScrape: 0,
    });
    deps.coordinationStore.tryClaimCompletion.mockResolvedValue(false);
    const service = makeService(deps);

    await service.finalizeIndex(message, 'succeeded');

    expect(deps.eventPublisher.publish).not.toHaveBeenCalled();
    expect(deps.coordinationStore.expireJobKeys).not.toHaveBeenCalled();
  });

  it('publishes crawl-complete with url=base_url (not the page url) and expires job keys on winning the race', async () => {
    const deps = makeDeps();
    deps.coordinationStore.removePendingIndex.mockResolvedValue({
      pendingIndex: 0,
      pendingScrape: 0,
    });
    deps.coordinationStore.tryClaimCompletion.mockResolvedValue(true);
    deps.coordinationStore.getCompletionUrls.mockResolvedValue({
      succeededUrls: ['https://example.com/page'],
      failedUrls: [],
    });
    const service = makeService(deps);

    await service.finalizeIndex(message, 'succeeded');

    expect(deps.eventPublisher.publish).toHaveBeenCalledWith(
      KAFKA_TOPICS.CRAWL_COMPLETE,
      'job-1',
      {
        job_id: 'job-1',
        user_id: 'user-1',
        query: 'what is this page about?',
        url: 'https://example.com/', // base_url, per event-schemas.md — NOT normalizedUrl
        succeeded_count: 1,
        failed_count: 0,
        succeeded_urls: ['https://example.com/page'],
        failed_urls: [],
        retry_count: 0,
      },
    );
    expect(deps.coordinationStore.expireJobKeys).toHaveBeenCalledWith(
      'job-1',
      60 * 60,
    );
  });
});

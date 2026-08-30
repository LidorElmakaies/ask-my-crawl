import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  KAFKA_TOPICS,
  type CrawlCompleteMessage,
  type PageScrapedMessage,
} from '@app/kafka-contracts';
import type { IEventPublisher } from '@app/kafka-client';
import {
  BLOB_REPOSITORY,
  CHUNKER,
  COORDINATION_STORE,
  EMBEDDING_CLIENT,
  EVENT_PUBLISHER,
  TEXT_EXTRACTOR,
  VECTOR_STORE,
} from '../tokens';
import { JOB_KEY_TTL_SECONDS } from '../models/constants';
import { PermanentIndexError } from '../models/permanent-index-error';
import type { IBlobRepository } from '../infrastructure/interfaces/blob-repository.interface';
import type { IChunker } from '../infrastructure/interfaces/chunker.interface';
import type { ICoordinationStore } from '../infrastructure/interfaces/coordination-store.interface';
import type { IEmbeddingClient } from '../infrastructure/interfaces/embedding-client.interface';
import type { ITextExtractor } from '../infrastructure/interfaces/text-extractor.interface';
import type {
  IVectorStore,
  VectorChunk,
} from '../infrastructure/interfaces/vector-store.interface';
import type { IIndexingUseCase } from './interfaces/indexing-use-case.interface';

// Indexing Worker's use case — fetch, clean, chunk, embed, delete-stale, upsert, per
// docs/planning/03-crawler-scraper-indexing-plan.md §7. See IIndexingUseCase's doc comment for why
// handle() and finalizeIndex() are split the way they are.
@Injectable()
export class IndexingService implements IIndexingUseCase {
  private readonly logger = new Logger(IndexingService.name);

  constructor(
    @Inject(BLOB_REPOSITORY) private readonly blobRepository: IBlobRepository,
    @Inject(TEXT_EXTRACTOR) private readonly textExtractor: ITextExtractor,
    @Inject(CHUNKER) private readonly chunker: IChunker,
    @Inject(EMBEDDING_CLIENT)
    private readonly embeddingClient: IEmbeddingClient,
    @Inject(VECTOR_STORE) private readonly vectorStore: IVectorStore,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    @Inject(COORDINATION_STORE)
    private readonly coordinationStore: ICoordinationStore,
  ) {}

  async handle(data: PageScrapedMessage): Promise<void> {
    // 1. Fetch the raw blob the Scraper saved. A missing object is permanent — retrying can't
    // produce a blob that isn't there (blobRepository.get() itself is responsible for throwing
    // PermanentIndexError on a 404/NoSuchKey vs. a plain Error on any other SeaweedFS failure).
    const html = await this.blobRepository.get(data.blobKey);

    // 2. Strip HTML down to plain text. A parse failure here would be the same bytes every retry —
    // permanent, not transient.
    let text: string;
    try {
      text = this.textExtractor.extract(html);
    } catch (err) {
      throw new PermanentIndexError(
        `Failed to extract text from blob ${data.blobKey}: ${(err as Error).message}`,
      );
    }

    await this.vectorStore.ensureCollection();

    // 3. Chunk. Empty/whitespace-only text (e.g. a JS-rendered page with no server HTML) is not an
    // error — just delete any stale vectors for a URL that's now empty and stop.
    const pieces = text.trim().length > 0 ? await this.chunker.split(text) : [];
    if (pieces.length === 0) {
      await this.vectorStore.deleteByUrl(data.normalizedUrl);
      return;
    }

    // 4. Embed. embeddingClient.embed() is responsible for throwing a plain Error on a connection
    // failure (transient) or PermanentIndexError on a persistent dimension mismatch.
    const vectors = await this.embeddingClient.embed(pieces);

    // 5. Delete stale vectors for this URL — always, before upsert, so a re-index is idempotent
    // regardless of whether the chunk count changed.
    await this.vectorStore.deleteByUrl(data.normalizedUrl);

    // 6. Upsert the new chunks.
    const chunks: VectorChunk[] = pieces.map((chunkText, i) => ({
      jobId: data.job_id,
      userId: data.user_id,
      url: data.normalizedUrl,
      query: data.query,
      chunkIndex: i,
      scrapedAt: data.scrapedAt,
      text: chunkText,
      vector: vectors[i],
    }));
    await this.vectorStore.upsert(chunks);
  }

  async finalizeIndex(
    data: PageScrapedMessage,
    // Not branched on for the completion logic below — unlike the Scraper's finalizeUrl, this side
    // never writes to the succeeded/failed Redis sets (those stay scrape-stage-only, see this
    // file's own header comment above and docs/specs/data-model.md). Still logged (the one real use
    // below): visibility into per-page index outcomes is useful on its own, and kept as a parameter
    // to mirror IIndexingUseCase's/IProcessUrlUseCase's shared shape in case a future revision of
    // this POC-level simplification wants to branch on it too.
    outcome: 'succeeded' | 'failed',
  ): Promise<void> {
    const jobId = data.job_id;
    this.logger.log(
      `Indexing ${outcome} for job_id=${jobId} url=${data.normalizedUrl}`,
    );

    const counts = await this.coordinationStore.decrementPendingIndex(jobId);
    if (counts.pendingScrape > 0 || counts.pendingIndex > 0) {
      return; // job isn't done yet
    }

    const wonRace = await this.coordinationStore.tryClaimCompletion(jobId);
    if (!wonRace) {
      return; // the Scraper already claimed it
    }

    const urls = await this.coordinationStore.getCompletionUrls(jobId);
    const message: CrawlCompleteMessage = {
      job_id: jobId,
      user_id: data.user_id,
      query: data.query,
      url: data.base_url,
      succeeded_count: urls.succeededUrls.length,
      failed_count: urls.failedUrls.length,
      succeeded_urls: urls.succeededUrls,
      failed_urls: urls.failedUrls,
    };
    await this.eventPublisher.publish(
      KAFKA_TOPICS.CRAWL_COMPLETE,
      jobId,
      message,
    );
    await this.coordinationStore.expireJobKeys(jobId, JOB_KEY_TTL_SECONDS);
  }
}

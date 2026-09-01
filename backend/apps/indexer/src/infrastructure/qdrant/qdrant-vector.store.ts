import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';
import { DEFAULT_VECTOR_DB_COLLECTION } from '../../models/constants';
import type {
  IVectorStore,
  VectorChunk,
} from '../interfaces/vector-store.interface';

// @qdrant/js-client-rest. Schema (HNSW + COSINE) and deployment: docs/specs/data-model.md,
// docs/planning/03-crawler-scraper-indexing-plan.md §7. Point IDs must be a uint64 or a valid
// UUID — randomUUID() per chunk on every upsert, no need for stability since deleteByUrl always
// runs first.
@Injectable()
export class QdrantVectorStore implements IVectorStore {
  private readonly client: QdrantClient;
  private readonly collectionName: string;
  private readonly dimension: number;
  private ensured = false;

  constructor(config: ConfigService) {
    const url = config.get<string>('VECTOR_DB_URL');
    if (!url) {
      throw new Error('VECTOR_DB_URL is not configured');
    }
    this.collectionName =
      config.get<string>('VECTOR_DB_COLLECTION') ??
      DEFAULT_VECTOR_DB_COLLECTION;
    this.dimension = Number(config.get<string>('EMBEDDING_DIMENSION') ?? '768');
    this.client = new QdrantClient({ url });
  }

  async ensureCollection(): Promise<void> {
    // In-process guard — collections aren't dropped at runtime by anything in this system.
    if (this.ensured) return;

    const { exists } = await this.client.collectionExists(this.collectionName);
    if (!exists) {
      await this.client.createCollection(this.collectionName, {
        vectors: { size: this.dimension, distance: 'Cosine' },
      });
    }
    this.ensured = true;
  }

  async deleteByUrl(url: string): Promise<void> {
    await this.client.delete(this.collectionName, {
      filter: { must: [{ key: 'url', match: { value: url } }] },
    });
  }

  async upsert(chunks: VectorChunk[]): Promise<void> {
    if (chunks.length === 0) return; // callers don't need to special-case an empty chunk set

    await this.client.upsert(this.collectionName, {
      points: chunks.map((chunk) => ({
        id: randomUUID(),
        vector: chunk.vector,
        payload: {
          job_id: chunk.jobId,
          user_id: chunk.userId,
          url: chunk.url,
          query: chunk.query,
          chunk_index: chunk.chunkIndex,
          scraped_at: chunk.scrapedAt,
          text: chunk.text,
        },
      })),
    });
  }
}

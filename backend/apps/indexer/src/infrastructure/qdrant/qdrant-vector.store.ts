import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';
import { DEFAULT_VECTOR_DB_COLLECTION } from '../../models/constants';
import type {
  IVectorStore,
  VectorChunk,
} from '../interfaces/vector-store.interface';

// @qdrant/js-client-rest — self-hosted vector DB, per docs/specs/data-model.md's schema (HNSW +
// COSINE, fixed, not configurable). Single-container deployment (devops/qdrant/docker-compose.yml)
// — replaced Milvus's real 3-container etcd+MinIO+standalone topology; verified directly against
// Qdrant's own API reference rather than assumed. Point IDs must be a uint64 or a valid UUID
// (arbitrary strings are rejected by Qdrant) — randomUUID() per chunk on every upsert; stable IDs
// across re-indexes aren't needed since deleteByUrl always runs first. VECTOR_DB_URL/
// VECTOR_DB_COLLECTION are named for the role, not the vendor — same reasoning as
// EMBEDDING_BASE_URL: swapping vector DBs still means writing a new class (unlike the embedding
// client's genuine drop-in provider-agnosticism), but nothing forces the config surface to
// advertise today's concrete choice either.
@Injectable()
export class QdrantVectorStore implements IVectorStore {
  private readonly client: QdrantClient;
  private readonly collectionName: string;
  private readonly dimension: number;
  private ensured = false;

  constructor(config: ConfigService) {
    const url = config.get<string>('VECTOR_DB_URL') ?? 'http://qdrant:6333';
    this.collectionName =
      config.get<string>('VECTOR_DB_COLLECTION') ??
      DEFAULT_VECTOR_DB_COLLECTION;
    this.dimension = Number(config.get<string>('EMBEDDING_DIMENSION') ?? '768');
    this.client = new QdrantClient({ url });
  }

  async ensureCollection(): Promise<void> {
    // Cheap in-process guard so a hot path doesn't re-check collectionExists on every single page —
    // safe because collections aren't dropped at runtime by anything in this system.
    if (this.ensured) return;

    const { exists } = await this.client.collectionExists(this.collectionName);
    if (!exists) {
      // Qdrant builds its HNSW/COSINE index as part of collection creation and the collection is
      // immediately queryable — no separate createIndex/loadCollection step, unlike Milvus.
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

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';
import {
  DEFAULT_VECTOR_DB_COLLECTION,
  RETRIEVAL_TOP_K,
} from '../../models/constants';
import type { RetrievedChunk } from '../../models/retrieved-chunk';
import { bm25Rank } from '../../utils/bm25';
import type { ILexicalRetriever } from '../interfaces/lexical-retriever.interface';

const SCROLL_PAGE_SIZE = 250;

type ScrollOffset =
  string | number | Record<string, unknown> | null | undefined;

interface JobChunk {
  text: string;
  url: string;
  chunkIndex: number;
}

/** BM25 over one job's chunk set, fetched once via a job_id-scoped Qdrant scroll. See
 * docs/planning/04-retrieval-quality-plan.md. */
@Injectable()
export class QdrantLexicalRetriever implements ILexicalRetriever {
  private readonly client: QdrantClient;
  private readonly collectionName: string;
  private readonly topK: number;

  constructor(config: ConfigService) {
    const url = config.get<string>('VECTOR_DB_URL');
    if (!url) {
      throw new Error('VECTOR_DB_URL is not configured');
    }
    this.collectionName =
      config.get<string>('VECTOR_DB_COLLECTION') ??
      DEFAULT_VECTOR_DB_COLLECTION;
    this.topK = Number(
      config.get<string>('RETRIEVAL_TOP_K') ?? RETRIEVAL_TOP_K,
    );
    this.client = new QdrantClient({ url });
  }

  async searchMany(
    queries: string[],
    jobId: string,
  ): Promise<RetrievedChunk[][]> {
    const chunks = await this.fetchAllChunksForJob(jobId);
    if (chunks.length === 0) {
      return queries.map(() => []);
    }

    const documents = chunks.map((chunk, i) => ({
      id: String(i),
      text: chunk.text,
    }));

    return queries.map((query) =>
      bm25Rank(query, documents)
        .filter((result) => result.score > 0) // 0 = no shared terms, drop it
        .sort((a, b) => b.score - a.score)
        .slice(0, this.topK)
        .map((result) => ({
          ...chunks[Number(result.id)],
          score: result.score,
        })),
    );
  }

  private async fetchAllChunksForJob(jobId: string): Promise<JobChunk[]> {
    const results: JobChunk[] = [];
    let offset: ScrollOffset = undefined;

    for (;;) {
      const response = await this.client.scroll(this.collectionName, {
        filter: { must: [{ key: 'job_id', match: { value: jobId } }] },
        limit: SCROLL_PAGE_SIZE,
        offset,
        with_payload: true,
        with_vector: false,
      });

      for (const point of response.points) {
        const payload = point.payload as {
          text: string;
          url: string;
          chunk_index: number;
        };
        results.push({
          text: payload.text,
          url: payload.url,
          chunkIndex: payload.chunk_index,
        });
      }

      if (
        response.next_page_offset === null ||
        response.next_page_offset === undefined
      ) {
        break;
      }
      offset = response.next_page_offset;
    }

    return results;
  }
}

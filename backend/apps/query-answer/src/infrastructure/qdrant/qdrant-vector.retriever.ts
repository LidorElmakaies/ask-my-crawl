import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';
import {
  DEFAULT_VECTOR_DB_COLLECTION,
  RETRIEVAL_TOP_K,
} from '../../models/constants';
import type {
  IVectorRetriever,
  RetrievedChunk,
} from '../interfaces/vector-retriever.interface';

@Injectable()
export class QdrantVectorRetriever implements IVectorRetriever {
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

  async search(vector: number[], jobId: string): Promise<RetrievedChunk[]> {
    const response = await this.client.query(this.collectionName, {
      query: vector,
      filter: { must: [{ key: 'job_id', match: { value: jobId } }] },
      limit: this.topK,
      with_payload: true,
    });

    return response.points.map((point) => {
      const payload = point.payload as { text: string; url: string };
      return {
        text: payload.text,
        url: payload.url,
        score: point.score,
      };
    });
  }
}

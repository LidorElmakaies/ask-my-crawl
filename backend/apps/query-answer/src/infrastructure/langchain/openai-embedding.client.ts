import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PermanentAnswerError } from '../../models/permanent-answer-error';
import type { IEmbeddingClient } from '../interfaces/embedding-client.interface';

// encodingFormat: 'float' — see docs/planning/03-crawler-scraper-indexing-plan.md §7.
@Injectable()
export class OpenAiEmbeddingClient implements IEmbeddingClient {
  private readonly client: OpenAIEmbeddings;
  private readonly expectedDimension: number;

  constructor(config: ConfigService) {
    const baseURL = config.get<string>('EMBEDDING_BASE_URL');
    if (!baseURL) {
      throw new Error('EMBEDDING_BASE_URL is not configured');
    }
    const model =
      config.get<string>('EMBEDDING_MODEL') ??
      'text-embedding-nomic-embed-text-v1.5';
    this.expectedDimension = Number(
      config.get<string>('EMBEDDING_DIMENSION') ?? '768',
    );
    this.client = new OpenAIEmbeddings({
      model,
      apiKey: config.get<string>('EMBEDDING_API_KEY') ?? 'not-needed', // SDK requires a truthy string
      encodingFormat: 'float',
      configuration: { baseURL },
    });
  }

  async embed(texts: string[]): Promise<number[][]> {
    const vectors = await this.client.embedDocuments(texts);
    for (const vector of vectors) {
      if (vector.length !== this.expectedDimension) {
        throw new PermanentAnswerError(
          `Embedding returned ${vector.length} dimensions, expected ${this.expectedDimension} (EMBEDDING_DIMENSION) — check EMBEDDING_MODEL matches what the configured provider has loaded`,
        );
      }
    }
    return vectors;
  }
}

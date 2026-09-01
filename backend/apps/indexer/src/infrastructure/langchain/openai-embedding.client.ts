import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PermanentIndexError } from '../../models/permanent-index-error';
import type { IEmbeddingClient } from '../interfaces/embedding-client.interface';

// Provider-agnostic: any OpenAI-compatible /v1/embeddings server works via EMBEDDING_BASE_URL, no
// code change. `encodingFormat: 'float'` is required — the `openai` SDK's default
// (`encoding_format: "base64"`) silently truncates the vector on the currently-configured
// provider; see docs/planning/03-crawler-scraper-indexing-plan.md §7.
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
        // Persistent misconfiguration — not something a retry fixes.
        throw new PermanentIndexError(
          `Embedding returned ${vector.length} dimensions, expected ${this.expectedDimension} (EMBEDDING_DIMENSION) — check EMBEDDING_MODEL matches what the configured provider has loaded`,
        );
      }
    }
    return vectors;
  }
}

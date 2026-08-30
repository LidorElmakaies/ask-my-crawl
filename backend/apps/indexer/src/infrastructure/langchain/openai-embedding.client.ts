import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PermanentIndexError } from '../../models/permanent-index-error';
import type { IEmbeddingClient } from '../interfaces/embedding-client.interface';

// Provider-agnostic: anything that speaks the OpenAI-compatible /v1/embeddings API works here
// unmodified, just by pointing EMBEDDING_BASE_URL at it. Swapping providers is a config change
// (EMBEDDING_BASE_URL/EMBEDDING_MODEL/EMBEDDING_DIMENSION/EMBEDDING_API_KEY), never a code change.
//
// `encodingFormat: 'float'` is required, not optional — verified live: the `openai` SDK's default
// request asks for `encoding_format: "base64"` (standard OpenAI-API behavior), and the
// currently-configured provider's base64 path silently returns a quarter of the real vector (192
// values instead of 768) for the default model here, not an error. Forcing plain `"float"`
// encoding bypasses that broken path entirely. Kept unconditional since every OpenAI-compatible
// provider supports plain float encoding — don't remove this "to simplify" without re-testing
// first.
@Injectable()
export class OpenAiEmbeddingClient implements IEmbeddingClient {
  private readonly client: OpenAIEmbeddings;
  private readonly expectedDimension: number;

  constructor(config: ConfigService) {
    const baseURL =
      config.get<string>('EMBEDDING_BASE_URL') ?? 'http://localhost:1234/v1';
    const model =
      config.get<string>('EMBEDDING_MODEL') ??
      'text-embedding-nomic-embed-text-v1.5'; // default matches the currently-configured
    // provider — whatever's actually loaded on the other end of EMBEDDING_BASE_URL must match
    // this, not the other way around.
    this.expectedDimension = Number(
      config.get<string>('EMBEDDING_DIMENSION') ?? '768',
    );
    this.client = new OpenAIEmbeddings({
      model,
      // A real hosted provider needs a real key here (EMBEDDING_API_KEY); a self-hosted server
      // usually ignores it, but the SDK still requires a truthy string to construct — 'not-needed'
      // is a placeholder, not a real credential.
      apiKey: config.get<string>('EMBEDDING_API_KEY') ?? 'not-needed',
      encodingFormat: 'float',
      configuration: { baseURL },
    });
  }

  async embed(texts: string[]): Promise<number[][]> {
    const vectors = await this.client.embedDocuments(texts);
    for (const vector of vectors) {
      if (vector.length !== this.expectedDimension) {
        // A persistent misconfiguration (wrong model loaded on the provider, or
        // EMBEDDING_DIMENSION doesn't match it) — not something a retry fixes.
        throw new PermanentIndexError(
          `Embedding returned ${vector.length} dimensions, expected ${this.expectedDimension} (EMBEDDING_DIMENSION) — check EMBEDDING_MODEL matches what the configured provider has loaded`,
        );
      }
    }
    return vectors;
  }
}

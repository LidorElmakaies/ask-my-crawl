import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { QUERY_EXPANSION_COUNT } from '../../models/constants';
import { QUERY_EXPANSION_SYSTEM_PROMPT } from '../../utils/prompts';
import type { IQueryExpander } from '../interfaces/query-expander.interface';

// Own scoped ChatOpenAI instance, independent of ChatOpenAiClient's.
@Injectable()
export class LlmQueryExpanderClient implements IQueryExpander {
  private readonly logger = new Logger(LlmQueryExpanderClient.name);
  private readonly client: ChatOpenAI;

  constructor(config: ConfigService) {
    const baseURL = config.get<string>('LLM_BASE_URL');
    if (!baseURL) {
      throw new Error('LLM_BASE_URL is not configured');
    }
    const model = config.get<string>('LLM_MODEL');
    if (!model) {
      throw new Error('LLM_MODEL is not configured');
    }
    this.client = new ChatOpenAI({
      model,
      apiKey: config.get<string>('LLM_API_KEY') ?? 'not-needed', // SDK requires a truthy string
      configuration: { baseURL },
    });
  }

  async expand(query: string): Promise<string[]> {
    try {
      const response = await this.client.invoke([
        new SystemMessage(QUERY_EXPANSION_SYSTEM_PROMPT),
        new HumanMessage(query),
      ]);
      const rewrites = this.parseRewrites(
        this.contentToString(response.content),
      );
      return [query, ...rewrites];
    } catch (err) {
      // Never let query expansion fail the job — degrade to single-query retrieval instead.
      this.logger.warn(
        `Query expansion failed, falling back to the original query alone: ${(err as Error).message}`,
      );
      return [query];
    }
  }

  private parseRewrites(raw: string): string[] {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
        if (
          Array.isArray(parsed) &&
          parsed.length === QUERY_EXPANSION_COUNT &&
          parsed.every(
            (item) => typeof item === 'string' && item.trim().length > 0,
          )
        ) {
          return parsed as string[];
        }
      } catch {
        // fall through to the warning + fallback below
      }
    }
    this.logger.warn(
      `Query expansion returned unparseable output, ignoring rewrites: ${raw}`,
    );
    return [];
  }

  private contentToString(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((block) =>
          typeof block === 'string'
            ? block
            : ((block as { text?: string })?.text ?? ''),
        )
        .join('');
    }
    return '';
  }
}

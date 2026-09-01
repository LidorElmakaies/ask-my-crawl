import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { ILlmClient } from '../interfaces/llm-client.interface';

@Injectable()
export class ChatOpenAiClient implements ILlmClient {
  private readonly client: ChatOpenAI;

  constructor(config: ConfigService) {
    const baseURL = config.get<string>('LLM_BASE_URL');
    if (!baseURL) {
      throw new Error('LLM_BASE_URL is not configured');
    }
    const model = config.get<string>('LLM_MODEL') ?? 'local-model';
    this.client = new ChatOpenAI({
      model,
      apiKey: config.get<string>('LLM_API_KEY') ?? 'not-needed', // SDK requires a truthy string
      configuration: { baseURL },
    });
  }

  async generateAnswer(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    const response = await this.client.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);
    return this.contentToString(response.content);
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

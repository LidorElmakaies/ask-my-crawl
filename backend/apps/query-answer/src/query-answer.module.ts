import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { KafkajsEventPublisher } from '@app/kafka-client';
import { CrawlCompleteConsumer } from './api/crawl-complete.consumer';
import { AnsweringService } from './application/answering.service';
import { ChatOpenAiClient } from './infrastructure/langchain/chat-openai.client';
import { OpenAiEmbeddingClient } from './infrastructure/langchain/openai-embedding.client';
import { QdrantVectorRetriever } from './infrastructure/qdrant/qdrant-vector.retriever';
import {
  ANSWERING_USE_CASE,
  EMBEDDING_CLIENT,
  EVENT_PUBLISHER,
  LLM_CLIENT,
  VECTOR_RETRIEVER,
} from './tokens';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [CrawlCompleteConsumer],
  providers: [
    { provide: ANSWERING_USE_CASE, useClass: AnsweringService },
    { provide: EMBEDDING_CLIENT, useClass: OpenAiEmbeddingClient },
    { provide: VECTOR_RETRIEVER, useClass: QdrantVectorRetriever },
    { provide: LLM_CLIENT, useClass: ChatOpenAiClient },
    {
      provide: EVENT_PUBLISHER,
      useFactory: (config: ConfigService) =>
        new KafkajsEventPublisher(config, 'query-answer'),
      inject: [ConfigService],
    },
  ],
})
export class QueryAnswerModule {}

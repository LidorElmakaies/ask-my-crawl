import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { KafkajsEventPublisher } from '@app/kafka-client';
import { IndexIntakeConsumer } from './api/index-intake.consumer';
import { IndexingWorker } from './api/indexing.worker';
import { IndexIntakeService } from './application/index-intake.service';
import { IndexingService } from './application/indexing.service';
import { BullMqIndexPageQueue } from './infrastructure/bullmq/bullmq-index-page.queue';
import { CheerioTextExtractor } from './infrastructure/html/cheerio-text-extractor';
import { OpenAiEmbeddingClient } from './infrastructure/langchain/openai-embedding.client';
import { RecursiveChunker } from './infrastructure/langchain/recursive-chunker';
import { QdrantVectorStore } from './infrastructure/qdrant/qdrant-vector.store';
import { RedisCoordinationStore } from './infrastructure/redis/redis-coordination.store';
import { S3BlobRepository } from './infrastructure/seaweedfs/s3-blob.repository';
import {
  BLOB_REPOSITORY,
  CHUNKER,
  COORDINATION_STORE,
  EMBEDDING_CLIENT,
  EVENT_PUBLISHER,
  INDEX_INTAKE_USE_CASE,
  INDEX_PAGE_QUEUE,
  INDEXING_USE_CASE,
  TEXT_EXTRACTOR,
  VECTOR_STORE,
} from './tokens';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        if (!redisUrl) {
          throw new Error('REDIS_URL is not configured');
        }
        // @nestjs/bullmq's `connection` option is host/port, not a URL string.
        const { hostname, port } = new URL(redisUrl);
        return {
          connection: { host: hostname, port: port ? Number(port) : 6379 },
        };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: 'index-page' }),
  ],
  controllers: [IndexIntakeConsumer],
  providers: [
    IndexingWorker, // not behind a token — @nestjs/bullmq discovers it via @Processor directly

    { provide: INDEX_INTAKE_USE_CASE, useClass: IndexIntakeService },
    { provide: INDEXING_USE_CASE, useClass: IndexingService },
    { provide: COORDINATION_STORE, useClass: RedisCoordinationStore },
    { provide: BLOB_REPOSITORY, useClass: S3BlobRepository },
    { provide: TEXT_EXTRACTOR, useClass: CheerioTextExtractor },
    { provide: CHUNKER, useClass: RecursiveChunker },
    { provide: EMBEDDING_CLIENT, useClass: OpenAiEmbeddingClient },
    { provide: VECTOR_STORE, useClass: QdrantVectorStore },
    { provide: INDEX_PAGE_QUEUE, useClass: BullMqIndexPageQueue },
    {
      provide: EVENT_PUBLISHER,
      useFactory: (config: ConfigService) =>
        new KafkajsEventPublisher(config, 'indexer'),
      inject: [ConfigService],
    },
  ],
})
export class IndexerModule {}

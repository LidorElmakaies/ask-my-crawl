import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { FrontierConsumer } from './api/frontier.consumer';
import { ProcessUrlWorker } from './api/process-url.worker';
import { FrontierIntakeService } from './application/frontier-intake.service';
import { ProcessUrlService } from './application/process-url.service';
import { BullMqProcessUrlQueue } from './infrastructure/bullmq/bullmq-process-url.queue';
import { CheerioLinkExtractor } from './infrastructure/html/cheerio-link-extractor';
import { FetchPageFetcher } from './infrastructure/http/fetch-page.fetcher';
import { RobotsTxtChecker } from './infrastructure/http/robots-txt.checker';
import { KafkajsEventPublisher } from './infrastructure/kafka/kafkajs-event-publisher';
import { RedisCoordinationStore } from './infrastructure/redis/redis-coordination.store';
import { S3BlobRepository } from './infrastructure/seaweedfs/s3-blob.repository';
import {
  BLOB_REPOSITORY,
  COORDINATION_STORE,
  EVENT_PUBLISHER,
  FRONTIER_INTAKE_USE_CASE,
  HTML_LINK_EXTRACTOR,
  PAGE_FETCHER,
  PROCESS_URL_QUEUE,
  PROCESS_URL_USE_CASE,
  ROBOTS_TXT_CHECKER,
} from './tokens';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        // REDIS_URL is a full connection string everywhere else in this app (RedisCoordinationStore
        // included) — parsed into host/port here because @nestjs/bullmq's `connection` option is
        // typed as ioredis RedisOptions (host/port/...), not a URL string, per NestJS's own docs.
        const redisUrl =
          config.get<string>('REDIS_URL') ?? 'redis://redis:6379';
        const { hostname, port } = new URL(redisUrl);
        return {
          connection: { host: hostname, port: port ? Number(port) : 6379 },
        };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: 'process-url' }),
  ],
  controllers: [FrontierConsumer],
  providers: [
    // Not behind a token — nothing depends on ProcessUrlWorker itself, it's the `@Processor`-
    // registered API-layer adapter @nestjs/bullmq discovers and manages directly.
    ProcessUrlWorker,
    { provide: FRONTIER_INTAKE_USE_CASE, useClass: FrontierIntakeService },
    { provide: PROCESS_URL_USE_CASE, useClass: ProcessUrlService },
    { provide: COORDINATION_STORE, useClass: RedisCoordinationStore },
    { provide: BLOB_REPOSITORY, useClass: S3BlobRepository },
    { provide: PAGE_FETCHER, useClass: FetchPageFetcher },
    { provide: ROBOTS_TXT_CHECKER, useClass: RobotsTxtChecker },
    { provide: HTML_LINK_EXTRACTOR, useClass: CheerioLinkExtractor },
    { provide: EVENT_PUBLISHER, useClass: KafkajsEventPublisher },
    { provide: PROCESS_URL_QUEUE, useClass: BullMqProcessUrlQueue },
  ],
})
export class ScraperModule {}

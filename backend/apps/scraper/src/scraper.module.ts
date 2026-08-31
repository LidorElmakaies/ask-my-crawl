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
import { KafkajsEventPublisher } from '@app/kafka-client';
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
        // @nestjs/bullmq's `connection` option is host/port, not a URL string.
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
    ProcessUrlWorker, // not behind a token — @nestjs/bullmq discovers it via @Processor directly

    { provide: FRONTIER_INTAKE_USE_CASE, useClass: FrontierIntakeService },
    { provide: PROCESS_URL_USE_CASE, useClass: ProcessUrlService },
    { provide: COORDINATION_STORE, useClass: RedisCoordinationStore },
    { provide: BLOB_REPOSITORY, useClass: S3BlobRepository },
    { provide: PAGE_FETCHER, useClass: FetchPageFetcher },
    { provide: ROBOTS_TXT_CHECKER, useClass: RobotsTxtChecker },
    { provide: HTML_LINK_EXTRACTOR, useClass: CheerioLinkExtractor },
    {
      provide: EVENT_PUBLISHER,
      useFactory: (config: ConfigService) =>
        new KafkajsEventPublisher(config, 'scraper'),
      inject: [ConfigService],
    },
    { provide: PROCESS_URL_QUEUE, useClass: BullMqProcessUrlQueue },
  ],
})
export class ScraperModule {}

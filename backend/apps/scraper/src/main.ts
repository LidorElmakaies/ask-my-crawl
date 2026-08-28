// OTel first — before ANY other import. The auto-instrumentations patch `require()`, so they only
// see http/express/pg/kafkajs/ioredis if they're installed before those modules load. Do not
// move, reorder, or let a formatter/lint autofix sort these two lines below the imports underneath
// them.
import { installGracefulShutdown, OtelLogger, startOtel } from '@app/otel';
startOtel('scraper');

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { KAFKA_CONSUMER_GROUPS } from '@app/kafka-contracts';
import { ScraperModule } from './scraper.module';

async function bootstrap() {
  // No HTTP surface — this bootstraps a Kafka-only microservice, same shape as job-manager's
  // main.ts. The `process-url` BullMQ worker (ProcessUrlWorker) starts on its own OnModuleInit,
  // independent of this Kafka transport.
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    ScraperModule,
    {
      // Passed directly at construction — see gateway/src/main.ts's comment for why this is
      // better than `bufferLogs: true` + a later `app.useLogger(logger)`.
      logger: new OtelLogger(),
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: 'scraper',
          // Container-network default (service name, not localhost — see devops.md's
          // non-negotiables), overridable via env for local (non-Docker)
          // `npx nest start scraper`. Matches devops/kafka/docker-compose.yml's PLAINTEXT listener.
          brokers: (process.env.KAFKA_BROKERS ?? 'kafka:19092').split(','),
        },
        consumer: { groupId: KAFKA_CONSUMER_GROUPS.SCRAPER },
      },
    },
  );

  installGracefulShutdown(app);

  await app.listen();

  console.log('Scraper listening for Kafka messages');
}
void bootstrap();

// OTel first — before ANY other import. See scraper/src/main.ts's identical comment for why.
import { installGracefulShutdown, OtelLogger, startOtel } from '@app/otel';
startOtel('indexer');

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { KAFKA_CONSUMER_GROUPS } from '@app/kafka-contracts';
import { IndexerModule } from './indexer.module';

async function bootstrap() {
  // No HTTP surface — Kafka-only microservice, same shape as the Scraper's/Job Manager Service's
  // main.ts. The `index-page` BullMQ worker (IndexingWorker) starts on its own OnModuleInit,
  // independent of this Kafka transport.
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    IndexerModule,
    {
      logger: new OtelLogger(),
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: 'indexer',
          brokers: (process.env.KAFKA_BROKERS ?? 'kafka:19092').split(','),
        },
        consumer: { groupId: KAFKA_CONSUMER_GROUPS.INDEXER },
      },
    },
  );

  installGracefulShutdown(app);

  await app.listen();

  console.log('Indexer listening for Kafka messages');
}
void bootstrap();

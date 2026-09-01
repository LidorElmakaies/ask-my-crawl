// OTel first — before ANY other import. See scraper/src/main.ts's identical comment for why.
import { installGracefulShutdown, OtelLogger, startOtel } from '@app/otel';
startOtel('indexer');

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { KAFKA_CONSUMER_GROUPS } from '@app/kafka-contracts';
import { IndexerModule } from './indexer.module';

async function bootstrap() {
  const kafkaBrokers = process.env.KAFKA_BROKERS;
  if (!kafkaBrokers) {
    throw new Error('KAFKA_BROKERS is not configured');
  }

  // No HTTP surface — Kafka-only microservice.
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    IndexerModule,
    {
      logger: new OtelLogger(),
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: 'indexer',
          brokers: kafkaBrokers.split(','),
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

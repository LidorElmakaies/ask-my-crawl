// OTel first — before ANY other import (auto-instrumentation patches require()). Don't reorder.
import { installGracefulShutdown, OtelLogger, startOtel } from '@app/otel';
startOtel('scraper');

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { KAFKA_CONSUMER_GROUPS } from '@app/kafka-contracts';
import { ScraperModule } from './scraper.module';

async function bootstrap() {
  // No HTTP surface — Kafka-only microservice.
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    ScraperModule,
    {
      logger: new OtelLogger(),
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: 'scraper',
          brokers: (process.env.KAFKA_BROKERS ?? 'kafka:19092').split(','), // container-network default
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

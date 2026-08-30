// OTel first — before ANY other import. The auto-instrumentations patch `require()`, so they only
// see http/express/pg if they're installed before those modules load. Do not move, reorder, or let
// a formatter/lint autofix sort these two lines below the imports underneath them.
import {
  createRequestLoggingMiddleware,
  installGracefulShutdown,
  OtelLogger,
  startOtel,
} from '@app/otel';
startOtel('job-manager');

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { KAFKA_CONSUMER_GROUPS } from '@app/kafka-contracts';
import { JobManagerModule } from './job-manager.module';

async function bootstrap() {
  const logger = new OtelLogger();
  const app = await NestFactory.create(JobManagerModule, { logger });
  app.use(createRequestLoggingMiddleware(logger));
  app.enableCors({ origin: true });

  // Connect Kafka microservice for consuming job-requests and answer-ready events
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'job-manager',
        brokers: (process.env.KAFKA_BROKERS ?? 'kafka:19092').split(','),
      },
      consumer: { groupId: KAFKA_CONSUMER_GROUPS.JOB_MANAGER },
    },
  });

  installGracefulShutdown(app);

  await app.startAllMicroservices();

  const port = process.env.PORT ?? 8002;
  await app.listen(port);

  console.log(
    `Job Manager Service listening on http://localhost:${port} and Kafka`,
  );
}
void bootstrap();

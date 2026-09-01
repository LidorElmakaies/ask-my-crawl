// OTel first — before ANY other import. See scraper/src/main.ts's identical comment for why.
import { installGracefulShutdown, OtelLogger, startOtel } from '@app/otel';
startOtel('query-answer');

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { KAFKA_CONSUMER_GROUPS } from '@app/kafka-contracts';
import { QueryAnswerModule } from './query-answer.module';

async function bootstrap() {
  // No HTTP surface — Kafka-only microservice.
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    QueryAnswerModule,
    {
      logger: new OtelLogger(),
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: 'query-answer',
          brokers: (process.env.KAFKA_BROKERS ?? 'kafka:19092').split(','),
        },
        // sessionTimeout well above ANSWER_RETRY_BACKOFF_CAP_MS — the retry backoff sleeps
        // in-process inside the message handler, which blocks kafkajs's heartbeat; a timeout
        // shorter than the max sleep gets this consumer kicked from the group mid-retry.
        consumer: {
          groupId: KAFKA_CONSUMER_GROUPS.QUERY_ANSWER,
          sessionTimeout: 60000,
          heartbeatInterval: 10000,
        },
      },
    },
  );

  installGracefulShutdown(app);

  await app.listen();

  console.log('Query/Answer Service listening for Kafka messages');
}
void bootstrap();

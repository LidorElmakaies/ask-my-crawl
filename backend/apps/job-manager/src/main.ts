// OTel first — before ANY other import. The auto-instrumentations patch `require()`, so they only
// see http/express/pg if they're installed before those modules load. Do not move, reorder, or let
// a formatter/lint autofix sort these two lines below the imports underneath them.
import { installGracefulShutdown, OtelLogger, startOtel } from '@app/otel';
startOtel('job-manager');

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { KAFKA_CONSUMER_GROUPS } from '@app/kafka-contracts';
import { JobManagerModule } from './job-manager.module';

async function bootstrap() {
  // No HTTP surface (see the approved plan's scope decision) — this bootstraps a Kafka-only
  // microservice, not an HTTP app.
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    JobManagerModule,
    {
      // Passed directly at construction — see gateway/src/main.ts's comment for why this is
      // better than `bufferLogs: true` + a later `app.useLogger(logger)`.
      logger: new OtelLogger(),
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: 'job-manager',
          // Container-network default (service name, not localhost — see devops.md's
          // non-negotiables), overridable via env for local (non-Docker)
          // `npx nest start job-manager`. Matches devops/kafka/docker-compose.yml's PLAINTEXT
          // listener. Same convention as AuthServiceHttpClient's AUTH_SERVICE_URL /
          // ToolProxyModule's GRAFANA_URL.
          brokers: (process.env.KAFKA_BROKERS ?? 'kafka:19092').split(','),
        },
        consumer: { groupId: KAFKA_CONSUMER_GROUPS.JOB_MANAGER },
      },
    },
  );

  installGracefulShutdown(app);

  await app.listen();

  console.log('Job Manager Service listening for Kafka messages');
}
void bootstrap();

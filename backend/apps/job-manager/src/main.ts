// OTel first — before ANY other import. The auto-instrumentations patch `require()`, so they only
// see http/express/pg if they're installed before those modules load. Do not move, reorder, or let
// a formatter/lint autofix sort these two lines below the imports underneath them.
import { OtelLogger, shutdownOtel, startOtel } from '@app/otel';
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

  // Without this, nothing (not even bootstrap chatter) reaches Loki — same gap @app/otel's
  // OtelLogger doc warns about, same fix as gateway/auth's main.ts.
  const logger = new OtelLogger('job-manager');
  app.useLogger(logger);

  // Node as PID 1 in the container gets SIGTERM directly from `docker stop`, but does nothing
  // with it by default — the process just sits there until Docker's grace period expires and
  // sends SIGKILL. This handler makes `docker stop`/`compose down`/`compose restart` actually
  // finish within that window: stop accepting new messages, let in-flight ones complete, THEN
  // tear down telemetry export, THEN exit. Order matters — closing OTel before the app would drop
  // traces/logs for messages still in flight.
  //
  // Deliberately NOT also calling app.enableShutdownHooks() — that installs Nest's own SIGTERM/
  // SIGINT listeners which *also* call app.close(), so both listeners fire on the same signal and
  // every module's onModuleDestroy hook (TypeORM's pool.end(), KafkajsEventPublisher's
  // producer.disconnect(), notably) runs twice. app.close() already runs those lifecycle hooks on
  // its own; this handler alone is sufficient. Same reasoning as auth/main.ts.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received, closing...`);
    void app
      .close()
      .then(() => shutdownOtel())
      .finally(() => process.exit(0));
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  await app.listen();

  console.log('Job Manager Service listening for Kafka messages');
}
void bootstrap();

// OTel first — before ANY other import. The auto-instrumentations patch `require()`, so they only
// see http/express/socket.io/pg if they're installed before those modules load. Do not move,
// reorder, or let a formatter/lint autofix sort these two lines below the imports underneath them.
import {
  createRequestLoggingMiddleware,
  installGracefulShutdown,
  OtelLogger,
  startOtel,
} from '@app/otel';
startOtel('gateway');

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { KAFKA_CONSUMER_GROUPS } from '@app/kafka-contracts';
import { GatewayModule } from './gateway.module';

async function bootstrap() {
  // Passed directly at construction — not `bufferLogs: true` + a later `app.useLogger(logger)` —
  // so there's no window where Nest's own default logger (not this one) handles bootstrap
  // messages; `OtelLogger`'s zero-arg constructor defaults its scope to whatever startOtel() was
  // called with above, so the service name can't drift between the two calls.
  const logger = new OtelLogger();
  const app = await NestFactory.create(GatewayModule, { logger });
  app.use(createRequestLoggingMiddleware(logger));
  // Permissive for the Docker Compose dev phase, same rationale as the WS gateway's own cors
  // option — no HTTP routes here yet, but the future /auth/* etc. proxy routes will need this.
  app.enableCors({ origin: true });
  app.useWebSocketAdapter(new IoAdapter(app));

  // Connect Kafka microservice for consuming job-created and result-saved events
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'gateway',
        brokers: (process.env.KAFKA_BROKERS ?? 'kafka:19092').split(','),
      },
      consumer: {
        groupId: KAFKA_CONSUMER_GROUPS.GATEWAY,
      },
    },
  });

  installGracefulShutdown(app);

  await app.startAllMicroservices();

  const port = process.env.PORT ?? 8000;
  await app.listen(port);

  console.log(
    `Gateway listening on http://localhost:${port} (Socket.IO path: /ws)`,
  );
}
void bootstrap();


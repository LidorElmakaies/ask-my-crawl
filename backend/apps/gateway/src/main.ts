// OTel first — before ANY other import. The auto-instrumentations patch `require()`, so they only
// see http/express/socket.io/pg if they're installed before those modules load. Do not move,
// reorder, or let a formatter/lint autofix sort these two lines below the imports underneath them.
import { createRequestLoggingMiddleware, OtelLogger, shutdownOtel, startOtel } from '@app/otel';
startOtel('gateway');

import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { GatewayModule } from './gateway.module';

async function bootstrap() {
  const app = await NestFactory.create(GatewayModule, { bufferLogs: true });
  const logger = new OtelLogger('gateway');
  app.useLogger(logger);
  app.use(createRequestLoggingMiddleware(logger));
  // Permissive for the Docker Compose dev phase, same rationale as the WS gateway's own cors
  // option — no HTTP routes here yet, but the future /auth/* etc. proxy routes will need this.
  app.enableCors({ origin: true });
  app.useWebSocketAdapter(new IoAdapter(app));

  // See apps/auth/src/main.ts for why this shape (app.close() -> shutdownOtel() -> exit, and NOT
  // also app.enableShutdownHooks() — that would double-close every module) — same reasoning
  // applies here.
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

  const port = process.env.PORT ?? 8000;
  await app.listen(port);

  console.log(
    `Gateway listening on http://localhost:${port} (Socket.IO path: /ws)`,
  );
}
void bootstrap();

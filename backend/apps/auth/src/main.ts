// OTel first — before ANY other import. The auto-instrumentations patch `require()`, so they only
// see http/express/pg if they're installed before those modules load. Do not move, reorder, or let
// a formatter/lint autofix sort these two lines below the imports underneath them.
import { createRequestLoggingMiddleware, OtelLogger, shutdownOtel, startOtel } from '@app/otel';
startOtel('auth');

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AuthModule } from './auth.module';

async function bootstrap() {
  const app = await NestFactory.create(AuthModule, { bufferLogs: true });
  const logger = new OtelLogger('auth');
  app.useLogger(logger);
  app.use(createRequestLoggingMiddleware(logger));
  // Permissive for the Docker Compose dev phase — the frontend calls this directly (different
  // origin/port) until the Gateway proxies /auth/*. Lock this down before any real deployment.
  app.enableCors({ origin: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Node as PID 1 in the container gets SIGTERM directly from `docker stop`, but does nothing
  // with it by default — the process just sits there until Docker's grace period expires and
  // sends SIGKILL. This handler makes `docker stop`/`compose down`/`compose restart` actually
  // finish within that window: stop accepting new connections, let in-flight ones complete, THEN
  // tear down telemetry export, THEN exit. Order matters — closing OTel before the app would drop
  // traces/logs for requests still in flight.
  //
  // Deliberately NOT also calling app.enableShutdownHooks() — that installs Nest's own SIGTERM/
  // SIGINT listeners which *also* call app.close(), so both listeners fire on the same signal and
  // every module's onModuleDestroy hook (TypeORM's pool.end(), notably) runs twice. app.close()
  // already runs those lifecycle hooks on its own; this handler alone is sufficient.
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

  const port = process.env.PORT ?? 8001;
  await app.listen(port);

  console.log(`Auth Service listening on http://localhost:${port}`);
}
void bootstrap();

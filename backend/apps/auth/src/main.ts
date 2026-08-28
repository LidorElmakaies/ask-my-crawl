// OTel first — before ANY other import. The auto-instrumentations patch `require()`, so they only
// see http/express/pg if they're installed before those modules load. Do not move, reorder, or let
// a formatter/lint autofix sort these two lines below the imports underneath them.
import {
  createRequestLoggingMiddleware,
  installGracefulShutdown,
  OtelLogger,
  startOtel,
} from '@app/otel';
startOtel('auth');

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AuthModule } from './auth.module';

async function bootstrap() {
  // Passed directly at construction — see gateway/src/main.ts's comment for why this is better
  // than `bufferLogs: true` + a later `app.useLogger(logger)`.
  const logger = new OtelLogger();
  const app = await NestFactory.create(AuthModule, { logger });
  app.use(createRequestLoggingMiddleware(logger));
  // Permissive for the Docker Compose dev phase — the frontend calls this directly (different
  // origin/port) until the Gateway proxies /auth/*. Lock this down before any real deployment.
  app.enableCors({ origin: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  installGracefulShutdown(app);

  const port = process.env.PORT ?? 8001;
  await app.listen(port);

  console.log(`Auth Service listening on http://localhost:${port}`);
}
void bootstrap();

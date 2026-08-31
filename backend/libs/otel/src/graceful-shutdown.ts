// import type only — see otel-logger.ts's file-level comment: nothing in @app/otel may pull
// @nestjs/common into the process as a real side effect before OTel's require()-patching runs.
import type { INestApplicationContext } from '@nestjs/common';
import { shutdownOtel } from './start-otel';

/**
 * SIGTERM/SIGINT handling: app.close() (in-flight work finishes) THEN shutdownOtel() THEN exit.
 * Call once, after NestFactory.create()/createMicroservice(), before app.listen().
 *
 * Don't also call app.enableShutdownHooks() — it installs its own SIGTERM/SIGINT listeners that
 * also call app.close(), double-running every onModuleDestroy hook (surfaces as "Called end on
 * pool more than once" from TypeORM). This handler is sufficient on its own.
 */
export function installGracefulShutdown(app: INestApplicationContext): void {
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
}

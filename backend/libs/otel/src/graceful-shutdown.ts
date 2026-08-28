// `LoggerService`/`INestApplicationContext` are imported as *types only* — see otel-logger.ts's
// file-level comment for why: @app/otel is required as the very first thing main.ts does, before
// OTel's require()-patching is installed, so nothing here may pull @nestjs/common into the process
// as a real side effect. `import type` is erased at compile time, so it doesn't.
import type { INestApplicationContext } from '@nestjs/common';
import { shutdownOtel } from './start-otel';

/**
 * Installs SIGTERM/SIGINT handling: stop accepting new work, let in-flight work finish
 * (`app.close()`, which also runs every module's `onModuleDestroy` hook), THEN tear down
 * telemetry export (`shutdownOtel()`), THEN exit. Order matters — closing OTel before the app
 * would drop traces/logs for work still in flight.
 *
 * Every service's `main.ts` used to hand-copy this same ~15-line block — extracted here so it
 * can't drift between services or be half-copied (e.g. missing the `shuttingDown` re-entrancy
 * guard, or the ordering).
 *
 * Call once, after `NestFactory.create()`/`createMicroservice()` returns, before `app.listen()`.
 *
 * Deliberately does NOT call `app.enableShutdownHooks()` — that installs Nest's own SIGTERM/SIGINT
 * listeners, which *also* call `app.close()`, so both listeners fire on the same signal and every
 * module's `onModuleDestroy` hook runs twice (surfaces as `Called end on pool more than once`
 * from TypeORM). This handler alone is sufficient; `enableShutdownHooks()` is redundant with it,
 * not complementary — don't add it alongside this.
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

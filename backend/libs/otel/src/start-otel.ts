// OpenTelemetry bootstrap for every backend app.
//
// *** Initialization order is load-bearing. ***
// The Node auto-instrumentations work by patching `require()`. A library is only instrumented if
// the patch is installed BEFORE that library is first required anywhere in the process. That means
// `startOtel()` must run as the literal first statement of `main.ts`, above the `@nestjs/core`
// import line:
//
//     import { startOtel } from '@app/otel';
//     startOtel('gateway');
//     import { NestFactory } from '@nestjs/core';   // <- must come AFTER the call
//
// TypeScript's CommonJS emit keeps import statements in source order (each becomes a `require()`
// where it was written), so the call really does happen before `@nestjs/core` — and therefore
// before `http`/`express`/`pg` — is loaded. Missing child spans under an HTTP root span is the
// signature of this ordering having been broken.
//
// *** What this does NOT protect against ***
// If the collector is unreachable (down, not yet started, network not joined), every export
// simply fails — and by default OTel's Node SDK swallows that failure. Nothing in the app crashes
// or complains; telemetry is just gone, silently, for as long as the outage lasts. The
// diag.setLogger call below turns that into a visible console line (`docker compose logs` shows
// export failures) instead of leaving it completely silent — it does NOT add retry buffering or a
// durable queue, so data during an outage is still lost, just no longer invisibly.

import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

/** Where the OTel Collector lives inside the compose network when nothing overrides it. */
export const DEFAULT_OTLP_ENDPOINT = 'http://otel-collector:4317';

let sdk: NodeSDK | undefined;
let startedServiceName: string | undefined;

/** The service name the running SDK was started with — used by OtelLogger for its logger scope. */
export function getOtelServiceName(): string {
  return startedServiceName ?? process.env.OTEL_SERVICE_NAME ?? 'unknown_service';
}

/**
 * Start the OpenTelemetry Node SDK: traces + metrics + logs, all exported over OTLP/gRPC to the
 * collector at `OTEL_EXPORTER_OTLP_ENDPOINT` (default `http://otel-collector:4317`).
 *
 * Safe to call exactly once, as the first statement of `main.ts`. Repeat calls are a no-op.
 *
 * @param serviceName value for the `service.name` resource attribute — must be unique per service
 *   and should match the `OTEL_SERVICE_NAME` env var the container is given.
 */
export function startOtel(serviceName: string): void {
  if (sdk) {
    return;
  }

  // Makes export failures (collector unreachable, etc.) show up as console output instead of
  // failing completely silently — see the file-level comment above. WARN, not ERROR: gRPC
  // "UNAVAILABLE" during a brief collector restart is expected noise, not something to page on.
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

  const url = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? DEFAULT_OTLP_ENDPOINT;

  const resource = defaultResource().merge(
    resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
  );

  sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({ url }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url }),
        exportIntervalMillis: 15_000,
      }),
    ],
    // NodeSDK builds the sdk-logs LoggerProvider from these and registers it as the global one,
    // which is what OtelLogger emits through (see otel-logger.ts).
    logRecordProcessors: [
      new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url }) }),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        // Every file read/write becomes a span otherwise — drowns out the useful ones.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
  startedServiceName = serviceName;

  // eslint-disable-next-line no-console
  console.log(
    `[otel] started for service.name="${serviceName}", OTLP/gRPC endpoint ${url}`,
  );
}

/**
 * Flush and stop the SDK. Callers own the ordering — this does not install its own signal
 * handlers (an earlier version did, and raced independently against the app's own shutdown: it
 * could tear down the logging/tracing pipeline out from under a still-serving HTTP server). Call
 * this from `main.ts`'s own SIGTERM/SIGINT handler, after `app.close()`, so in-flight requests
 * finish (and get to log/trace normally) before telemetry export is torn down. See main.ts for
 * the full sequence.
 */
export async function shutdownOtel(): Promise<void> {
  try {
    await sdk?.shutdown();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[otel] shutdown failed', err);
  }
}

// OpenTelemetry bootstrap for every backend app.
//
// Order is load-bearing: startOtel() must be the literal first statement of main.ts, before any
// other import — Node's auto-instrumentation patches require(), so a library required first is
// never instrumented. Missing child spans under an HTTP root span is the signature of broken order.
//
// If the collector is unreachable, the SDK swallows export failures silently by default —
// diag.setLogger below at least makes that visible in logs (no retry/buffering, data is still
// lost during an outage, just no longer invisibly).

import * as os from 'os';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import {
  defaultResource,
  resourceFromAttributes,
} from '@opentelemetry/resources';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  ATTR_SERVICE_INSTANCE_ID,
  ATTR_SERVICE_NAME,
} from '@opentelemetry/semantic-conventions';

/** Where the OTel Collector lives inside the compose network when nothing overrides it. */
export const DEFAULT_OTLP_ENDPOINT = 'http://otel-collector:4317';

let sdk: NodeSDK | undefined;
let startedServiceName: string | undefined;
let startedServiceInstanceId: string | undefined;

/** The service name the running SDK was started with — used by OtelLogger for its logger scope. */
export function getOtelServiceName(): string {
  return (
    startedServiceName ?? process.env.OTEL_SERVICE_NAME ?? 'unknown_service'
  );
}

/** Disambiguates replicas of the same service — os.hostname() is unique per container (Docker's
 * default short container ID), unlike process.pid (always 1 in a container). */
export function getOtelServiceInstanceId(): string {
  return startedServiceInstanceId ?? os.hostname();
}

/** Starts traces + metrics + logs, exported over OTLP/gRPC. Call once, as the first statement of
 * main.ts — repeat calls are a no-op. `serviceName` must be unique per service. */
export function startOtel(serviceName: string): void {
  if (sdk) {
    return;
  }

  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN); // WARN not ERROR — brief outages are expected noise

  const url = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? DEFAULT_OTLP_ENDPOINT;
  const instanceId = os.hostname();

  const resource = defaultResource().merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_INSTANCE_ID]: instanceId,
    }),
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
    logRecordProcessors: [
      // registers the global LoggerProvider OtelLogger emits through
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
  startedServiceInstanceId = instanceId;

  console.log(
    `[otel] started for service.name="${serviceName}", service.instance.id="${instanceId}", OTLP/gRPC endpoint ${url}`,
  );
}

/** Flush and stop the SDK. No signal handlers of its own — call from main.ts's SIGTERM/SIGINT
 * handler, after app.close(), so in-flight requests finish first. */
export async function shutdownOtel(): Promise<void> {
  try {
    await sdk?.shutdown();
  } catch (err) {
    console.error('[otel] shutdown failed', err);
  }
}

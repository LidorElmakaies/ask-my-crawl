// A NestJS LoggerService that tees every log line to two places:
//   1. the console, timestamped/PID'd close to Nest's own default format, so `docker compose
//      logs -f <service>` stays readable
//   2. the OTel logs pipeline (sdk-logs LoggerProvider -> OTLP/gRPC -> Collector -> Loki)
//
// Deliberately not Winston: no extra dependency, no second logging config to keep in sync.
//
// `LoggerService` is imported as a *type only* on purpose. `@app/otel` is required as the very
// first thing `main.ts` does — before OTel's require()-patching is installed for the modules that
// come after it — so this file must not pull `@nestjs/common` (or anything else instrumented)
// into the process as a side effect. A `import type` is erased at compile time, so it doesn't.
// `@opentelemetry/api`/`api-logs` are the OTel SDK's own API packages, never auto-instrumentation
// targets themselves, so importing them here at module scope is safe regardless of load order.

import type { LoggerService } from '@nestjs/common';
import { context as otelContext, trace } from '@opentelemetry/api';
import {
  logs,
  SeverityNumber,
  type AnyValueMap,
} from '@opentelemetry/api-logs';
import { getOtelServiceInstanceId, getOtelServiceName } from './start-otel';

type Severity = { number: SeverityNumber; text: string };

const SEVERITY = {
  fatal: { number: SeverityNumber.FATAL, text: 'FATAL' },
  error: { number: SeverityNumber.ERROR, text: 'ERROR' },
  warn: { number: SeverityNumber.WARN, text: 'WARN' },
  log: { number: SeverityNumber.INFO, text: 'INFO' },
  debug: { number: SeverityNumber.DEBUG, text: 'DEBUG' },
  verbose: { number: SeverityNumber.TRACE, text: 'TRACE' },
} as const satisfies Record<string, Severity>;

/**
 * Wire it up in `main.ts`, after `startOtel(...)` has run:
 *
 *     const app = await NestFactory.create(AppModule, { bufferLogs: true });
 *     app.useLogger(new OtelLogger());
 */
export class OtelLogger implements LoggerService {
  constructor(private readonly scope: string = getOtelServiceName()) {}

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.emit(SEVERITY.log, message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.emit(SEVERITY.error, message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.emit(SEVERITY.warn, message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.emit(SEVERITY.debug, message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.emit(SEVERITY.verbose, message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.emit(SEVERITY.fatal, message, optionalParams);
  }

  private emit(
    severity: Severity,
    message: unknown,
    optionalParams: unknown[],
  ): void {
    const text = stringify(message);

    // Nest passes the logger context (e.g. "NestFactory", "RoutesResolver") as the last argument,
    // and for error() a stack trace just before it. Everything else is extra detail.
    const params = [...optionalParams];
    let logContext: string | undefined;
    if (params.length > 0 && typeof params[params.length - 1] === 'string') {
      logContext = params.pop() as string;
    }
    const details =
      params.length > 0 ? params.map(stringify).join(' ') : undefined;

    // Whatever span is active when this log call happens (e.g. inside an HTTP request handler) —
    // undefined during bootstrap, before any request has an active span. Read once, used for both
    // outputs below, rather than re-derived per output (the active context can only be read
    // synchronously, right here — not later, e.g. from inside an async callback).
    const spanContext = trace.getSpan(otelContext.active())?.spanContext();

    // Console: human-readable, timestamped, structured similarly to Nest's own default shape
    // ("[Nest] <pid>  - <date>  <LEVEL> [<context>] <message>") so `docker compose logs` didn't
    // regress just because the logger implementation changed underneath it — but the bracketed tag
    // is the actual service name (`this.scope`, e.g. "scraper"), not the literal word "Nest": a
    // line's text needs to say which SERVICE produced it, not just visually resemble Nest's own
    // logger. `process.pid` alone doesn't identify which REPLICA of that service either — every
    // container runs its Node process as PID 1 (Dockerfiles use exec-form CMD) — so
    // `service.instance.id` (the container hostname, see start-otel.ts) rides alongside it.
    const consoleFn =
      severity.number >= SeverityNumber.ERROR ? console.error : console.log;
    consoleFn(
      `[${this.scope}] ${process.pid}/${getOtelServiceInstanceId()}  - ${new Date().toISOString()}  ${severity.text}` +
        `${logContext ? ` [${logContext}]` : ''} ${text}` +
        `${spanContext ? ` (trace_id=${spanContext.traceId})` : ''}`,
      ...(details ? [details] : []),
    );

    try {
      // Resolved lazily every time: the global LoggerProvider is only registered once
      // startOtel() has run, and this class may be constructed by code that doesn't know that.
      //
      // Body is JSON, not a plain string — Loki's derivedFields config
      // (devops/observability/grafana/provisioning/datasources/datasources.yaml) links a log line
      // to its trace via a `"trace_id":"<id>"` regex match against the LINE ITSELF, not against
      // labels/structured metadata. That's a real constraint on this shape, not a style choice —
      // changing the key names here breaks that link silently.
      const attributes: AnyValueMap = {};
      if (logContext) attributes['log.context'] = logContext;
      if (details) attributes['log.details'] = details;
      if (spanContext) {
        attributes.trace_id = spanContext.traceId;
        attributes.span_id = spanContext.spanId;
      }

      const body = JSON.stringify({
        message: text,
        ...(logContext ? { context: logContext } : {}),
        ...(details ? { details } : {}),
        ...(spanContext
          ? { trace_id: spanContext.traceId, span_id: spanContext.spanId }
          : {}),
      });

      logs.getLogger(this.scope).emit({
        severityNumber: severity.number,
        severityText: severity.text,
        body,
        attributes,
      });
    } catch {
      // Telemetry must never take the app down.
    }
  }
}

function stringify(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Error) {
    return value.stack ?? `${value.name}: ${value.message}`;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

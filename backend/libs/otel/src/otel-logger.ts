// A NestJS LoggerService that tees every log line to the console and the OTel logs pipeline
// (sdk-logs LoggerProvider -> OTLP/gRPC -> Collector -> Loki). Not Winston — no extra dependency.
//
// `LoggerService` is imported as a *type only* — @app/otel is required first in main.ts, before
// OTel's require()-patching runs, so this file must not pull @nestjs/common in as a real
// side-effect import. @opentelemetry/api/api-logs are safe to import normally — never
// auto-instrumentation targets themselves.

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

    // Nest passes the logger context as the last argument.
    const params = [...optionalParams];
    let logContext: string | undefined;
    if (params.length > 0 && typeof params[params.length - 1] === 'string') {
      logContext = params.pop() as string;
    }
    const details =
      params.length > 0 ? params.map(stringify).join(' ') : undefined;

    // The active span, if any — must be read synchronously here, not later from a callback.
    const spanContext = trace.getSpan(otelContext.active())?.spanContext();

    // service.instance.id (container hostname) rides alongside pid, since every container's
    // process is PID 1 — pid alone can't tell replicas apart.
    const consoleFn =
      severity.number >= SeverityNumber.ERROR ? console.error : console.log;
    consoleFn(
      `[${this.scope}] ${process.pid}/${getOtelServiceInstanceId()}  - ${new Date().toISOString()}  ${severity.text}` +
        `${logContext ? ` [${logContext}]` : ''} ${text}` +
        `${spanContext ? ` (trace_id=${spanContext.traceId})` : ''}`,
      ...(details ? [details] : []),
    );

    try {
      // Body is JSON, not a plain string — Loki's derivedFields config links a log line to its
      // trace via a `"trace_id":"<id>"` regex match against the line itself. Changing these key
      // names breaks that link silently.
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

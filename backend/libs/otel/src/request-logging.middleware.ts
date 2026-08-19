// Every backend app needs at least one log line per HTTP request — without it, only bootstrap
// chatter ("Nest application successfully started", route mapping) ever reaches Loki, and there's
// nothing to correlate a trace back to (see OtelLogger's trace_id wiring, which only has anything
// to attach to if a log call happens while a request's span is active).
//
// A plain Express-style middleware, not a NestJS interceptor — this needs to run identically in
// every app (gateway, auth, future services) with zero per-app wiring beyond one `app.use(...)`
// line, and it has no dependency on Nest's DI container.

import type { NextFunction, Request, Response } from 'express';
import type { LoggerService } from '@nestjs/common';

export function createRequestLoggingMiddleware(logger: LoggerService) {
  return function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      const line = `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms`;
      if (res.statusCode >= 500) {
        logger.error(line, 'HTTP');
      } else {
        logger.log(line, 'HTTP');
      }
    });

    next();
  };
}

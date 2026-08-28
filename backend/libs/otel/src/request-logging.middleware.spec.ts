import type { LoggerService } from '@nestjs/common';
import { createRequestLoggingMiddleware } from './request-logging.middleware';

function makeLogger(): jest.Mocked<Pick<LoggerService, 'log' | 'error'>> {
  return { log: jest.fn(), error: jest.fn() };
}

function makeRes(statusCode: number) {
  const handlers: Record<string, () => void> = {};
  return {
    statusCode,
    on: (event: string, cb: () => void) => {
      handlers[event] = cb;
    },
    fire: () => handlers.finish?.(),
  };
}

describe('createRequestLoggingMiddleware', () => {
  it('logs method, path, status, and a duration once the response finishes', () => {
    const logger = makeLogger();
    const middleware = createRequestLoggingMiddleware(
      logger as unknown as LoggerService,
    );
    const req = { method: 'POST', originalUrl: '/auth/register' } as any;
    const res = makeRes(201);
    const next = jest.fn();

    middleware(req, res as any, next);
    expect(next).toHaveBeenCalled();
    expect(logger.log).not.toHaveBeenCalled(); // not yet — response hasn't finished

    res.fire();
    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log.mock.calls[0][0]).toMatch(
      /^POST \/auth\/register 201 \d+(\.\d+)?ms$/,
    );
    expect(logger.log.mock.calls[0][1]).toBe('HTTP');
  });

  it('routes 5xx responses to error() instead of log()', () => {
    const logger = makeLogger();
    const middleware = createRequestLoggingMiddleware(
      logger as unknown as LoggerService,
    );
    const req = { method: 'GET', originalUrl: '/jobs' } as any;
    const res = makeRes(500);

    middleware(req, res as any, jest.fn());
    res.fire();

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('does not log at all if the response never finishes', () => {
    const logger = makeLogger();
    const middleware = createRequestLoggingMiddleware(
      logger as unknown as LoggerService,
    );
    middleware(
      { method: 'GET', originalUrl: '/x' } as any,
      makeRes(200) as any,
      jest.fn(),
    );

    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});

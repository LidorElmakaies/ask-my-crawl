import { SeverityNumber } from '@opentelemetry/api-logs';

const mockEmit = jest.fn();
const mockGetLogger = jest.fn(() => ({ emit: mockEmit }));
const mockGetSpan = jest.fn();

jest.mock('@opentelemetry/api-logs', () => {
  const actual = jest.requireActual('@opentelemetry/api-logs');
  return {
    ...actual,
    logs: { getLogger: (...args: unknown[]) => mockGetLogger(...args) },
  };
});

jest.mock('@opentelemetry/api', () => ({
  trace: { getSpan: (...args: unknown[]) => mockGetSpan(...args) },
  context: { active: () => 'active-context' },
}));

jest.mock('./start-otel', () => ({
  getOtelServiceName: () => 'test-service',
}));

// Imported after the mocks above so the module under test picks them up.
import { OtelLogger } from './otel-logger';

describe('OtelLogger', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSpan.mockReturnValue(undefined);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('routes log()/warn()/debug()/verbose() to console.log, error()/fatal() to console.error', () => {
    const logger = new OtelLogger();

    logger.log('a');
    logger.warn('b');
    logger.debug('c');
    logger.verbose('d');
    expect(logSpy).toHaveBeenCalledTimes(4);
    expect(errorSpy).not.toHaveBeenCalled();

    logger.error('e');
    logger.fatal('f');
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it('pops a trailing string argument as the Nest logger context, not log detail', () => {
    const logger = new OtelLogger();
    logger.log('starting up', 'NestFactory');

    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({ 'log.context': 'NestFactory' }),
      }),
    );
    const body = JSON.parse(mockEmit.mock.calls[0][0].body);
    expect(body).toEqual({ message: 'starting up', context: 'NestFactory' });
  });

  it('keeps non-trailing-string params as log.details, distinct from the context', () => {
    const logger = new OtelLogger();
    logger.error('boom', { code: 42 }, 'AuthController');

    const [emitted] = mockEmit.mock.calls[0];
    expect(emitted.attributes['log.context']).toBe('AuthController');
    expect(emitted.attributes['log.details']).toContain('"code":42');
  });

  it('maps each severity to the correct OTel SeverityNumber', () => {
    const logger = new OtelLogger();
    logger.debug('x');
    expect(mockEmit.mock.calls[0][0].severityNumber).toBe(SeverityNumber.DEBUG);

    logger.error('y');
    expect(mockEmit.mock.calls[1][0].severityNumber).toBe(SeverityNumber.ERROR);
  });

  it('stringifies an Error message using its stack, not "[object Error]"', () => {
    const logger = new OtelLogger();
    const err = new Error('bad input');
    logger.error(err);

    const body = JSON.parse(mockEmit.mock.calls[0][0].body);
    expect(body.message).toContain('Error: bad input');
  });

  it('falls back to String(value) if a value cannot be JSON.stringify-d (circular)', () => {
    const logger = new OtelLogger();
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => logger.log(circular)).not.toThrow();
    const body = JSON.parse(mockEmit.mock.calls[0][0].body);
    expect(body.message).toBe(String(circular));
  });

  it('includes trace_id/span_id in both the emitted body and attributes when a span is active', () => {
    mockGetSpan.mockReturnValue({
      spanContext: () => ({ traceId: 'trace-abc', spanId: 'span-123' }),
    });
    const logger = new OtelLogger();
    logger.log('handled request');

    const [emitted] = mockEmit.mock.calls[0];
    expect(emitted.attributes.trace_id).toBe('trace-abc');
    expect(emitted.attributes.span_id).toBe('span-123');
    expect(JSON.parse(emitted.body)).toMatchObject({ trace_id: 'trace-abc', span_id: 'span-123' });
  });

  it('omits trace_id/span_id entirely when no span is active (bootstrap logs)', () => {
    const logger = new OtelLogger();
    logger.log('booting');

    const [emitted] = mockEmit.mock.calls[0];
    expect(emitted.attributes.trace_id).toBeUndefined();
    expect(JSON.parse(emitted.body).trace_id).toBeUndefined();
  });

  it('still logs to console even if the OTel emit call throws', () => {
    mockEmit.mockImplementationOnce(() => {
      throw new Error('collector unreachable');
    });
    const logger = new OtelLogger();

    expect(() => logger.log('still works')).not.toThrow();
    expect(logSpy).toHaveBeenCalled();
  });

  it('uses the constructor-provided scope, falling back to getOtelServiceName()', () => {
    new OtelLogger('custom-scope').log('a');
    expect(mockGetLogger).toHaveBeenCalledWith('custom-scope');

    new OtelLogger().log('b');
    expect(mockGetLogger).toHaveBeenCalledWith('test-service');
  });
});

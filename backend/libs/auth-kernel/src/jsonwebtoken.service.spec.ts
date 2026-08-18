import type { ConfigService } from '@nestjs/config';
import { JsonWebTokenService } from './jsonwebtoken.service';

function makeService(secret: string | undefined): JsonWebTokenService {
  const config = {
    get: jest.fn().mockReturnValue(secret),
  } as unknown as ConfigService;
  return new JsonWebTokenService(config);
}

describe('JsonWebTokenService', () => {
  it('signs and verifies a round trip', () => {
    const service = makeService('test-secret');
    const token = service.sign({ sub: 'user-1', role: 'admin' }, '1h');
    expect(service.verify(token)).toEqual({ sub: 'user-1', role: 'admin' });
  });

  it('rejects a token signed with a different secret', () => {
    const signer = makeService('secret-a');
    const verifier = makeService('secret-b');
    const token = signer.sign({ sub: 'user-1', role: 'user' }, '1h');

    expect(verifier.verify(token)).toBeNull();
  });

  it('rejects a malformed token', () => {
    const service = makeService('test-secret');
    expect(service.verify('not-a-jwt')).toBeNull();
  });

  it('throws if JWT_SECRET is not configured', () => {
    const service = makeService(undefined);
    expect(() => service.sign({ sub: 'user-1', role: 'user' }, '1h')).toThrow(
      'JWT_SECRET is not configured',
    );
  });
});

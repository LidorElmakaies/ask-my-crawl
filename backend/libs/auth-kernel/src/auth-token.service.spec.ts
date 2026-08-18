import type { IJwtService } from './interfaces/jwt-service.interface';
import { AuthTokenService } from './auth-token.service';

describe('AuthTokenService', () => {
  function makeService(jwtService: IJwtService) {
    return new AuthTokenService(jwtService);
  }

  it('returns null without calling the JWT service when the token is missing', async () => {
    const verify = jest.fn();
    const service = makeService({ sign: jest.fn(), verify });

    expect(await service.verify(null)).toBeNull();
    expect(await service.verify(undefined)).toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });

  it('returns null when the JWT service rejects the token', async () => {
    const service = makeService({ sign: jest.fn(), verify: () => null });

    expect(await service.verify('bad-token')).toBeNull();
  });

  it('maps a valid verify result to { userId, role }', async () => {
    const service = makeService({
      sign: jest.fn(),
      verify: (token) =>
        token === 'good-token' ? { sub: 'user-1', role: 'admin' } : null,
    });

    expect(await service.verify('good-token')).toEqual({
      userId: 'user-1',
      role: 'admin',
    });
  });
});

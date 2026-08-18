/* eslint-disable @typescript-eslint/unbound-method --
   false positive: these are jest.fn() mocks, not real prototype methods relying on `this`. */
import type { IJwtService } from '@app/auth-kernel';
import type { IPasswordHasher } from '../infrastructure/interfaces/password-hasher.interface';
import type { IRefreshTokenRepository } from '../infrastructure/interfaces/refresh-token-repository.interface';
import type { IUserRepository } from '../infrastructure/interfaces/user-repository.interface';
import type { User } from '../models/user';
import { AuthService } from './auth.service';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'alice@example.com',
    name: 'Alice',
    phoneNumber: null,
    telegramChatId: null,
    passwordHash: 'stored-hash',
    passwordSalt: 'stored-salt',
    role: 'user',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeDeps() {
  const users: jest.Mocked<IUserRepository> = {
    create: jest.fn(),
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    hasAnyAdmin: jest.fn(),
  };
  const refreshTokens: jest.Mocked<IRefreshTokenRepository> = {
    create: jest.fn(),
    findByTokenHash: jest.fn(),
    revoke: jest.fn(),
  };
  const hasher: jest.Mocked<IPasswordHasher> = {
    hash: jest.fn(),
    verify: jest.fn(),
  };
  const jwt: jest.Mocked<IJwtService> = { sign: jest.fn(), verify: jest.fn() };
  return { users, refreshTokens, hasher, jwt };
}

describe('AuthService', () => {
  describe('register', () => {
    it('hashes the password, stores the user, and returns tokens without hash/salt', async () => {
      const { users, refreshTokens, hasher, jwt } = makeDeps();
      users.findByEmail.mockResolvedValue(null);
      hasher.hash.mockReturnValue({ hash: 'new-hash', salt: 'new-salt' });
      const created = makeUser({
        passwordHash: 'new-hash',
        passwordSalt: 'new-salt',
      });
      users.create.mockResolvedValue(created);
      jwt.sign.mockReturnValue('signed-access-token');
      refreshTokens.create.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        tokenHash: 'irrelevant',
        expiresAt: new Date(),
        revokedAt: null,
        createdAt: new Date(),
      });

      const service = new AuthService(users, refreshTokens, hasher, jwt);
      const result = await service.register({
        email: 'Alice@Example.com',
        password: 'correct-horse',
      });

      expect(users.findByEmail).toHaveBeenCalledWith('alice@example.com');
      expect(users.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'alice@example.com', role: 'user' }),
      );
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user).not.toHaveProperty('passwordSalt');
      expect(result.tokens.accessToken).toBe('signed-access-token');
      expect(result.tokens.refreshToken).toEqual(expect.any(String));
    });

    it('throws a conflict when the email is already registered', async () => {
      const { users, refreshTokens, hasher, jwt } = makeDeps();
      users.findByEmail.mockResolvedValue(makeUser());

      const service = new AuthService(users, refreshTokens, hasher, jwt);
      await expect(
        service.register({ email: 'alice@example.com', password: 'whatever1' }),
      ).rejects.toThrow('Email is already registered');
      expect(users.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('issues tokens when the password is correct', async () => {
      const { users, refreshTokens, hasher, jwt } = makeDeps();
      const user = makeUser();
      users.findByEmail.mockResolvedValue(user);
      hasher.verify.mockReturnValue(true);
      jwt.sign.mockReturnValue('signed-access-token');
      refreshTokens.create.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        tokenHash: 'x',
        expiresAt: new Date(),
        revokedAt: null,
        createdAt: new Date(),
      });

      const service = new AuthService(users, refreshTokens, hasher, jwt);
      const result = await service.login({
        email: 'alice@example.com',
        password: 'correct',
      });

      expect(hasher.verify).toHaveBeenCalledWith(
        'correct',
        'stored-hash',
        'stored-salt',
      );
      expect(result.tokens.accessToken).toBe('signed-access-token');
    });

    it('rejects when the user does not exist', async () => {
      const { users, refreshTokens, hasher, jwt } = makeDeps();
      users.findByEmail.mockResolvedValue(null);

      const service = new AuthService(users, refreshTokens, hasher, jwt);
      await expect(
        service.login({ email: 'nobody@example.com', password: 'whatever' }),
      ).rejects.toThrow('Invalid email or password');
    });

    it('rejects when the password is wrong', async () => {
      const { users, refreshTokens, hasher, jwt } = makeDeps();
      users.findByEmail.mockResolvedValue(makeUser());
      hasher.verify.mockReturnValue(false);

      const service = new AuthService(users, refreshTokens, hasher, jwt);
      await expect(
        service.login({ email: 'alice@example.com', password: 'wrong' }),
      ).rejects.toThrow('Invalid email or password');
    });
  });

  describe('refresh', () => {
    it('revokes the used token and issues a new pair', async () => {
      const { users, refreshTokens, hasher, jwt } = makeDeps();
      const stored = {
        id: 'rt-1',
        userId: 'user-1',
        tokenHash: 'hashed',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        createdAt: new Date(),
      };
      refreshTokens.findByTokenHash.mockResolvedValue(stored);
      users.findById.mockResolvedValue(makeUser());
      jwt.sign.mockReturnValue('new-access-token');
      refreshTokens.create.mockResolvedValue({ ...stored, id: 'rt-2' });

      const service = new AuthService(users, refreshTokens, hasher, jwt);
      const tokens = await service.refresh('raw-refresh-token');

      expect(refreshTokens.revoke).toHaveBeenCalledWith('rt-1');
      expect(tokens.accessToken).toBe('new-access-token');
    });

    it('rejects an unknown token', async () => {
      const { users, refreshTokens, hasher, jwt } = makeDeps();
      refreshTokens.findByTokenHash.mockResolvedValue(null);

      const service = new AuthService(users, refreshTokens, hasher, jwt);
      await expect(service.refresh('bogus')).rejects.toThrow(
        'Invalid or expired refresh token',
      );
    });

    it('rejects an already-revoked token', async () => {
      const { users, refreshTokens, hasher, jwt } = makeDeps();
      refreshTokens.findByTokenHash.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        tokenHash: 'hashed',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
        createdAt: new Date(),
      });

      const service = new AuthService(users, refreshTokens, hasher, jwt);
      await expect(service.refresh('raw')).rejects.toThrow(
        'Invalid or expired refresh token',
      );
    });

    it('rejects an expired token', async () => {
      const { users, refreshTokens, hasher, jwt } = makeDeps();
      refreshTokens.findByTokenHash.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        tokenHash: 'hashed',
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
        createdAt: new Date(),
      });

      const service = new AuthService(users, refreshTokens, hasher, jwt);
      await expect(service.refresh('raw')).rejects.toThrow(
        'Invalid or expired refresh token',
      );
    });
  });

  describe('logout', () => {
    it('revokes the matching token', async () => {
      const { users, refreshTokens, hasher, jwt } = makeDeps();
      refreshTokens.findByTokenHash.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        tokenHash: 'hashed',
        expiresAt: new Date(),
        revokedAt: null,
        createdAt: new Date(),
      });

      const service = new AuthService(users, refreshTokens, hasher, jwt);
      await service.logout('raw');

      expect(refreshTokens.revoke).toHaveBeenCalledWith('rt-1');
    });

    it('does nothing if the token is not found (no error)', async () => {
      const { users, refreshTokens, hasher, jwt } = makeDeps();
      refreshTokens.findByTokenHash.mockResolvedValue(null);

      const service = new AuthService(users, refreshTokens, hasher, jwt);
      await expect(service.logout('bogus')).resolves.toBeUndefined();
      expect(refreshTokens.revoke).not.toHaveBeenCalled();
    });
  });
});

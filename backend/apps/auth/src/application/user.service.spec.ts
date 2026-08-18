/* eslint-disable @typescript-eslint/unbound-method --
   false positive: these are jest.fn() mocks, not real prototype methods relying on `this`. */
import type { IPasswordHasher } from '../infrastructure/interfaces/password-hasher.interface';
import type { IUserRepository } from '../infrastructure/interfaces/user-repository.interface';
import type { User } from '../models/user';
import { UserService } from './user.service';

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
    createdAt: new Date(),
    updatedAt: new Date(),
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
  const hasher: jest.Mocked<IPasswordHasher> = {
    hash: jest.fn(),
    verify: jest.fn(),
  };
  return { users, hasher };
}

describe('UserService', () => {
  it('getById returns null (not an error) when the user does not exist', async () => {
    const { users, hasher } = makeDeps();
    users.findById.mockResolvedValue(null);

    const service = new UserService(users, hasher);
    expect(await service.getById('missing')).toBeNull();
  });

  it('getById never leaks passwordHash/passwordSalt', async () => {
    const { users, hasher } = makeDeps();
    users.findById.mockResolvedValue(makeUser());

    const service = new UserService(users, hasher);
    const result = await service.getById('user-1');

    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('passwordSalt');
  });

  it('updateSelf re-hashes the password only when one is provided', async () => {
    const { users, hasher } = makeDeps();
    hasher.hash.mockReturnValue({ hash: 'new-hash', salt: 'new-salt' });
    users.update.mockResolvedValue(
      makeUser({ passwordHash: 'new-hash', passwordSalt: 'new-salt' }),
    );

    const service = new UserService(users, hasher);
    await service.updateSelf('user-1', { password: 'new-password' });

    expect(hasher.hash).toHaveBeenCalledWith('new-password');
    expect(users.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        passwordHash: 'new-hash',
        passwordSalt: 'new-salt',
      }),
    );
  });

  it('updateSelf normalizes email to lowercase', async () => {
    const { users, hasher } = makeDeps();
    users.update.mockResolvedValue(makeUser({ email: 'bob@example.com' }));

    const service = new UserService(users, hasher);
    await service.updateSelf('user-1', { email: 'Bob@Example.com' });

    expect(users.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ email: 'bob@example.com' }),
    );
  });

  it('updateByAdmin throws NotFoundException for a missing user', async () => {
    const { users, hasher } = makeDeps();
    users.findById.mockResolvedValue(null);

    const service = new UserService(users, hasher);
    await expect(
      service.updateByAdmin('missing', { role: 'admin' }),
    ).rejects.toThrow('User not found');
    expect(users.update).not.toHaveBeenCalled();
  });

  it('deleteByAdmin throws NotFoundException for a missing user', async () => {
    const { users, hasher } = makeDeps();
    users.findById.mockResolvedValue(null);

    const service = new UserService(users, hasher);
    await expect(service.deleteByAdmin('missing')).rejects.toThrow(
      'User not found',
    );
    expect(users.delete).not.toHaveBeenCalled();
  });

  it('listAll maps every user through toPublicUser', async () => {
    const { users, hasher } = makeDeps();
    users.findAll.mockResolvedValue([
      makeUser({ id: 'a' }),
      makeUser({ id: 'b' }),
    ]);

    const service = new UserService(users, hasher);
    const result = await service.listAll();

    expect(result).toHaveLength(2);
    expect(result[0]).not.toHaveProperty('passwordHash');
  });
});

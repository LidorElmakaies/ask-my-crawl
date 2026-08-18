import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PASSWORD_HASHER, USER_REPOSITORY } from '../tokens';
import type { IPasswordHasher } from '../infrastructure/interfaces/password-hasher.interface';
import type { IUserRepository } from '../infrastructure/interfaces/user-repository.interface';
import type {
  IUserService,
  UpdateSelfInput,
  UpdateUserAdminInput,
} from './interfaces/user-service.interface';
import { toPublicUser, type PublicUser } from '../models/user';

@Injectable()
export class UserService implements IUserService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
  ) {}

  async getById(id: string): Promise<PublicUser | null> {
    const user = await this.users.findById(id);
    return user ? toPublicUser(user) : null;
  }

  async updateSelf(id: string, input: UpdateSelfInput): Promise<PublicUser> {
    const { password, ...rest } = input;
    const updated = await this.users.update(id, {
      ...rest,
      email: rest.email?.toLowerCase(),
      ...(password ? this.hashPassword(password) : {}),
    });
    return toPublicUser(updated);
  }

  async listAll(): Promise<PublicUser[]> {
    const users = await this.users.findAll();
    return users.map(toPublicUser);
  }

  async updateByAdmin(
    id: string,
    input: UpdateUserAdminInput,
  ): Promise<PublicUser> {
    const existing = await this.users.findById(id);
    if (!existing) {
      throw new NotFoundException('User not found');
    }
    const updated = await this.users.update(id, {
      ...input,
      email: input.email?.toLowerCase(),
    });
    return toPublicUser(updated);
  }

  async deleteByAdmin(id: string): Promise<void> {
    const existing = await this.users.findById(id);
    if (!existing) {
      throw new NotFoundException('User not found');
    }
    await this.users.delete(id);
  }

  private hashPassword(password: string): {
    passwordHash: string;
    passwordSalt: string;
  } {
    const { hash, salt } = this.hasher.hash(password);
    return { passwordHash: hash, passwordSalt: salt };
  }
}

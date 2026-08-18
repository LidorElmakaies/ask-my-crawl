import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { User } from '../../models/user';
import type {
  CreateUserInput,
  IUserRepository,
  UpdateUserInput,
} from '../interfaces/user-repository.interface';
import { UserEntity } from './entities/user.entity';

/**
 * Maps between UserEntity (persistence-specific, TypeORM decorators) and the plain User
 * domain type — the Application layer never sees UserEntity or knows TypeORM exists.
 */
function toDomain(entity: UserEntity): User {
  return {
    id: entity.id,
    email: entity.email,
    name: entity.name,
    phoneNumber: entity.phoneNumber,
    telegramChatId: entity.telegramChatId,
    passwordHash: entity.passwordHash,
    passwordSalt: entity.passwordSalt,
    role: entity.role,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

@Injectable()
export class TypeOrmUserRepository implements IUserRepository {
  constructor(
    @InjectRepository(UserEntity) private readonly repo: Repository<UserEntity>,
  ) {}

  async create(input: CreateUserInput): Promise<User> {
    const entity = this.repo.create(input);
    return toDomain(await this.repo.save(entity));
  }

  async findById(id: string): Promise<User | null> {
    const entity = await this.repo.findOneBy({ id });
    return entity ? toDomain(entity) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const entity = await this.repo.findOneBy({ email });
    return entity ? toDomain(entity) : null;
  }

  async findAll(): Promise<User[]> {
    const entities = await this.repo.find({ order: { createdAt: 'ASC' } });
    return entities.map(toDomain);
  }

  async update(id: string, input: UpdateUserInput): Promise<User> {
    await this.repo.update({ id }, input);
    const entity = await this.repo.findOneByOrFail({ id });
    return toDomain(entity);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete({ id });
  }

  async hasAnyAdmin(): Promise<boolean> {
    const count = await this.repo.countBy({ role: 'admin' });
    return count > 0;
  }
}

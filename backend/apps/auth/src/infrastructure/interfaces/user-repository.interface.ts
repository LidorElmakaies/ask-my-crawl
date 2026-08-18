import type { UserRole } from '@app/auth-kernel';
import type { User } from '../../models/user';

export interface CreateUserInput {
  email: string;
  name: string | null;
  phoneNumber: string | null;
  telegramChatId: string | null;
  passwordHash: string;
  passwordSalt: string;
  role: UserRole;
}

export interface UpdateUserInput {
  email?: string;
  name?: string | null;
  phoneNumber?: string | null;
  telegramChatId?: string | null;
  passwordHash?: string;
  passwordSalt?: string;
  role?: UserRole;
}

/**
 * Implemented by the Infrastructure layer (TypeOrmUserRepository). Consumed by the
 * Application layer (AuthService, UserService).
 */
export interface IUserRepository {
  create(input: CreateUserInput): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findAll(): Promise<User[]>;
  update(id: string, input: UpdateUserInput): Promise<User>;
  delete(id: string): Promise<void>;
  hasAnyAdmin(): Promise<boolean>;
}

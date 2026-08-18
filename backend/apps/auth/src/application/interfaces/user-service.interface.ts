import type { UserRole } from '@app/auth-kernel';
import type { PublicUser } from '../../models/user';

export interface UpdateSelfInput {
  email?: string;
  name?: string;
  phoneNumber?: string;
  telegramChatId?: string;
  password?: string;
}

export interface UpdateUserAdminInput {
  email?: string;
  phoneNumber?: string;
  role?: UserRole;
}

/**
 * Implemented by the Application layer (UserService). Consumed by the API layer
 * (UsersController for /me, AdminUsersController for /admin/users*). Permission checks
 * (self vs admin) happen in the API layer's guards — this service just does the CRUD.
 */
export interface IUserService {
  getById(id: string): Promise<PublicUser | null>;
  updateSelf(id: string, input: UpdateSelfInput): Promise<PublicUser>;
  listAll(): Promise<PublicUser[]>;
  updateByAdmin(id: string, input: UpdateUserAdminInput): Promise<PublicUser>;
  deleteByAdmin(id: string): Promise<void>;
}

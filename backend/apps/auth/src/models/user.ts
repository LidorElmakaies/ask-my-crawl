// Domain layer — pure data shapes, no framework dependencies, no behavioral contracts. Not to
// be confused with application/interfaces/ or infrastructure/interfaces/, which hold `I<Thing>`
// interfaces implemented by classes. This is just "what a user looks like."
//
// UserRole itself lives in @app/auth-kernel, not here — it's baked into the JWT, so every app
// that signs/verifies tokens needs the same type, not just Auth Service. Still a plain-type
// import (auth-kernel's user-role.ts has zero framework deps either), so this stays a pure
// domain file.
import type { UserRole } from '@app/auth-kernel';

export interface User {
  id: string;
  email: string;
  name: string | null;
  phoneNumber: string | null;
  telegramChatId: string | null;
  passwordHash: string;
  passwordSalt: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

/** Safe to hand back to a client — never includes passwordHash/passwordSalt. */
export type PublicUser = Omit<User, 'passwordHash' | 'passwordSalt'>;

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phoneNumber: user.phoneNumber,
    telegramChatId: user.telegramChatId,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

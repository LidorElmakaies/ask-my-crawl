import type { UserRole } from '../user-role';

export interface JwtPayload {
  sub: string;
  role: UserRole;
}

/**
 * Implemented by JsonWebTokenService (the only class in the monorepo allowed to import
 * `jsonwebtoken`). Consumed wherever a service needs to sign or verify the platform's access
 * tokens.
 */
export interface IJwtService {
  sign(payload: JwtPayload, expiresIn: string): string;
  verify(token: string): JwtPayload | null;
}

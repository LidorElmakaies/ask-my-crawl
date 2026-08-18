import type { UserRole } from '../user-role';

export interface AuthTokenPayload {
  userId: string;
  role: UserRole;
}

/**
 * Implemented by AuthTokenService. The higher-level "is this request authenticated" check —
 * consumed by every app's own API-layer guards (Gateway's WS handshake, Auth Service's
 * JwtAuthGuard), so none of them duplicate the missing/invalid-token handling.
 */
export interface IAuthTokenService {
  /** Returns the decoded identity, or null if the token is missing/invalid/expired. */
  verify(token: string | null | undefined): Promise<AuthTokenPayload | null>;
}

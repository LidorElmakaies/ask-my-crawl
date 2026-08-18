import type { RefreshToken } from '../../models/refresh-token';

/**
 * Implemented by the Infrastructure layer (TypeOrmRefreshTokenRepository). Consumed by the
 * Application layer (AuthService).
 */
export interface IRefreshTokenRepository {
  create(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<RefreshToken>;
  findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;
  revoke(id: string): Promise<void>;
}

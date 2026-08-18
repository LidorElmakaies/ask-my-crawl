import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import type {
  IJwtService,
  JwtPayload,
} from './interfaces/jwt-service.interface';
import { isUserRole } from './user-role';

/**
 * The only class in the monorepo allowed to import `jsonwebtoken`. Every app that signs or
 * verifies the platform's access tokens goes through this, sharing one JWT_SECRET and one
 * payload shape ({ sub, role }) so they can never drift apart between services.
 */
@Injectable()
export class JsonWebTokenService implements IJwtService {
  constructor(private readonly config: ConfigService) {}

  sign(payload: JwtPayload, expiresIn: string): string {
    return jwt.sign(payload, this.getSecret(), {
      expiresIn,
    } as jwt.SignOptions);
  }

  verify(token: string): JwtPayload | null {
    try {
      const decoded = jwt.verify(token, this.getSecret());
      if (
        typeof decoded === 'string' ||
        !decoded.sub ||
        !isUserRole(decoded.role)
      ) {
        return null;
      }
      return { sub: String(decoded.sub), role: decoded.role };
    } catch {
      // Expired, malformed, or bad signature — all treated the same: unauthenticated.
      return null;
    }
  }

  private getSecret(): string {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }
    return secret;
  }
}

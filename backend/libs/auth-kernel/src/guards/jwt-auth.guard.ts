import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AUTH_TOKEN_SERVICE } from '../tokens';
import type { AuthTokenPayload } from '../interfaces/auth-token.interface';
import type { IAuthTokenService } from '../interfaces/auth-token.interface';

// Moved here from Auth Service once Gateway needed the identical guard for its own HTTP routes
// (the /auth/* proxy, /me, /admin/users*) — was a straight copy-paste until then, zero
// Auth-Service-specific logic in it even before the move.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_TOKEN_SERVICE)
    private readonly authTokenService: IAuthTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthTokenPayload }>();
    const token = this.extractToken(request);
    const identity = await this.authTokenService.verify(token);

    if (!identity) {
      throw new UnauthorizedException('Missing or invalid access token');
    }

    request.user = identity;
    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return null;
    }
    return header.slice('Bearer '.length);
  }
}

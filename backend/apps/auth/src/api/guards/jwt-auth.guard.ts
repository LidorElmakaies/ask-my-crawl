import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AUTH_TOKEN_SERVICE,
  type AuthTokenPayload,
  type IAuthTokenService,
} from '@app/auth-kernel';
import type { Request } from 'express';

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

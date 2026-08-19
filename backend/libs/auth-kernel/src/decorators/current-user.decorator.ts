import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthTokenPayload } from '../interfaces/auth-token.interface';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthTokenPayload => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: AuthTokenPayload }>();
    return request.user;
  },
);

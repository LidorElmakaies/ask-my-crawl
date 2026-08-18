import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthTokenPayload } from '@app/auth-kernel';
import type { Request } from 'express';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthTokenPayload => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: AuthTokenPayload }>();
    return request.user;
  },
);

import { Body, Controller, Inject, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AUTH_PROXY_SERVICE } from '../../tokens';
import type { IAuthProxyService } from '../application/interfaces/auth-proxy-service.interface';
import { writeProxyResponse } from './write-proxy-response';

/**
 * Per docs/specs/api-contracts.md: none of these require an access token — they're how you get
 * one. Pure passthrough to Auth Service, same path/body, response relayed verbatim — no domain
 * decisions happen here, see docs/specs/backend-architecture.md on what belongs in the API layer.
 */
@Controller('auth')
export class AuthProxyController {
  constructor(
    @Inject(AUTH_PROXY_SERVICE) private readonly proxy: IAuthProxyService,
  ) {}

  @Post('register')
  async register(@Body() body: unknown, @Res() res: Response): Promise<void> {
    writeProxyResponse(
      res,
      await this.proxy.forward({ method: 'POST', path: '/auth/register', body }),
    );
  }

  @Post('login')
  async login(@Body() body: unknown, @Res() res: Response): Promise<void> {
    writeProxyResponse(
      res,
      await this.proxy.forward({ method: 'POST', path: '/auth/login', body }),
    );
  }

  @Post('refresh')
  async refresh(@Body() body: unknown, @Res() res: Response): Promise<void> {
    writeProxyResponse(
      res,
      await this.proxy.forward({ method: 'POST', path: '/auth/refresh', body }),
    );
  }

  @Post('logout')
  async logout(@Body() body: unknown, @Res() res: Response): Promise<void> {
    writeProxyResponse(
      res,
      await this.proxy.forward({ method: 'POST', path: '/auth/logout', body }),
    );
  }
}

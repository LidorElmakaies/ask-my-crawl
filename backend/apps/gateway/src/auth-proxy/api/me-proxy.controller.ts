import { Body, Controller, Get, Inject, Patch, Req, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@app/auth-kernel';
import type { Request, Response } from 'express';
import { AUTH_PROXY_SERVICE } from '../../tokens';
import type { IAuthProxyService } from '../application/interfaces/auth-proxy-service.interface';
import { writeProxyResponse } from './write-proxy-response';

/**
 * Per docs/specs/auth.md: Gateway verifies the JWT locally first (JwtAuthGuard, no network round-
 * trip) — a fast 401 for a missing/malformed/expired token — then still forwards the
 * Authorization header downstream; Auth Service's own guard re-verifies it and is what actually
 * resolves *which* user this is. This controller never decodes the token itself.
 */
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeProxyController {
  constructor(
    @Inject(AUTH_PROXY_SERVICE) private readonly proxy: IAuthProxyService,
  ) {}

  @Get()
  async getMe(@Req() req: Request, @Res() res: Response): Promise<void> {
    writeProxyResponse(
      res,
      await this.proxy.forward({
        method: 'GET',
        path: '/me',
        authorizationHeader: req.headers.authorization,
      }),
    );
  }

  @Patch()
  async updateMe(
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    writeProxyResponse(
      res,
      await this.proxy.forward({
        method: 'PATCH',
        path: '/me',
        body,
        authorizationHeader: req.headers.authorization,
      }),
    );
  }
}

import { Body, Controller, Delete, Get, Inject, Param, Patch, Req, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard } from '@app/auth-kernel';
import type { Request, Response } from 'express';
import { AUTH_PROXY_SERVICE } from '../../tokens';
import type { IAuthProxyService } from '../application/interfaces/auth-proxy-service.interface';
import { writeProxyResponse } from './write-proxy-response';

// Same local-verify-then-forward reasoning as MeProxyController — see its header comment. Role
// check happens twice by design: here (fast 403, no network call) and again inside Auth Service's
// own AdminUsersController (unchanged) — defense in depth, not redundant, per auth.md.
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminUsersProxyController {
  constructor(
    @Inject(AUTH_PROXY_SERVICE) private readonly proxy: IAuthProxyService,
  ) {}

  @Get()
  async list(@Req() req: Request, @Res() res: Response): Promise<void> {
    writeProxyResponse(
      res,
      await this.proxy.forward({
        method: 'GET',
        path: '/admin/users',
        authorizationHeader: req.headers.authorization,
      }),
    );
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    writeProxyResponse(
      res,
      await this.proxy.forward({
        method: 'GET',
        path: `/admin/users/${id}`,
        authorizationHeader: req.headers.authorization,
      }),
    );
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    writeProxyResponse(
      res,
      await this.proxy.forward({
        method: 'PATCH',
        path: `/admin/users/${id}`,
        body,
        authorizationHeader: req.headers.authorization,
      }),
    );
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    writeProxyResponse(
      res,
      await this.proxy.forward({
        method: 'DELETE',
        path: `/admin/users/${id}`,
        authorizationHeader: req.headers.authorization,
      }),
    );
  }
}

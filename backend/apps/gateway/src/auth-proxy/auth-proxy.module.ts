import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthKernelModule } from '@app/auth-kernel';
import { AdminUsersProxyController } from './api/admin-users-proxy.controller';
import { AuthProxyController } from './api/auth-proxy.controller';
import { MeProxyController } from './api/me-proxy.controller';
import { AuthProxyService } from './application/auth-proxy.service';
import { AuthServiceHttpClient } from './infrastructure/auth-service-http.client';
import { AUTH_PROXY_SERVICE, AUTH_SERVICE_CLIENT } from '../tokens';

@Module({
  imports: [HttpModule, AuthKernelModule],
  controllers: [
    AuthProxyController,
    MeProxyController,
    AdminUsersProxyController,
  ],
  providers: [
    { provide: AUTH_PROXY_SERVICE, useClass: AuthProxyService },
    { provide: AUTH_SERVICE_CLIENT, useClass: AuthServiceHttpClient },
  ],
})
export class AuthProxyModule {}

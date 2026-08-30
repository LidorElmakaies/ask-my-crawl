import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthProxyModule } from './auth-proxy/auth-proxy.module';
import { JobsProxyModule } from './jobs-proxy/jobs-proxy.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ToolProxyModule } from './tool-proxy/tool-proxy.module';

// Gateway is a multi-concern app (the system's edge) — realtime, auth-proxy, jobs-proxy, and tool-proxy
// share no models, application logic, or infrastructure, and never call each other, so each is a fully
// self-contained module (own api/application/infrastructure) rather than one flat structure. See
// docs/specs/backend-architecture.md's "single-concern vs multi-concern app" section. This module
// just composes them; it owns no providers of its own.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RealtimeModule,
    AuthProxyModule,
    JobsProxyModule,
    ToolProxyModule,
  ],
})
export class GatewayModule {}

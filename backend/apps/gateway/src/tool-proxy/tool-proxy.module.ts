import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthKernelModule } from '@app/auth-kernel';
import { AdminAuthGateMiddleware } from './infrastructure/middleware/admin-auth-gate.middleware';
import { createToolProxyMiddleware } from './infrastructure/proxy/tool-proxy.factory';

// Gated reverse proxy fronting the admin-only tool UIs (Grafana, Kafka UI) — see
// docs/planning/02-admin-dashboard-plan.md. Sibling concern to realtime/ and auth-proxy/ (see
// docs/specs/backend-architecture.md's "multi-concern app" section) but with no
// Application/Infrastructure interface layering of its own: there's no business logic here, only
// a request gate and a byte-forwarding proxy, both depending on AUTH_TOKEN_SERVICE's *existing*
// interface (@app/auth-kernel) rather than declaring a new one.
//
// Uses NestModule.configure() (not raw app.use() in main.ts) specifically so the gate middleware
// can be resolved through Nest's DI container (it needs AUTH_TOKEN_SERVICE) without touching the
// load-bearing main.ts file — see the plan doc's "Why Nest middleware" note.
@Module({
  imports: [ConfigModule, AuthKernelModule],
})
export class ToolProxyModule implements NestModule {
  constructor(private readonly config: ConfigService) {}

  configure(consumer: MiddlewareConsumer): void {
    const grafanaTarget = this.config.get<string>('GRAFANA_URL');
    if (!grafanaTarget) {
      throw new Error('GRAFANA_URL is not configured');
    }
    const kafkaUiTarget = this.config.get<string>('KAFKA_UI_URL');
    if (!kafkaUiTarget) {
      throw new Error('KAFKA_UI_URL is not configured');
    }

    // Route pattern verified empirically against this repo's actual installed Express 5 / Nest 11
    // (path-to-regexp v8 — bare `*` wildcards are rejected outright, see the plan doc's flagged
    // risk). `'<prefix>{/*path}'` matches both the bare tool root and everything nested under it,
    // while correctly rejecting a false prefix match like `admin/grafanaXYZ`.
    //
    // **`forRoutes({ path, method: RequestMethod.ALL })` — an object, not a bare string.** A bare
    // string route (`.forRoutes('admin/grafana{/*path}')`) makes Nest's RoutesMapper tag it with a
    // `method: -1` sentinel (see `getRouteInfoFromPath` in routes-mapper.js), which isn't a real
    // key in RouterMethodFactory's `REQUEST_METHOD_MAP` — the lookup misses and silently falls
    // back to `target.use` (Express's `app.use(path, fn)` *mount* form) instead of `app.all(path,
    // fn)`. `app.use(path, fn)` strips the matched prefix from `req.url` before the middleware
    // ever sees it — exactly the prefix-stripping this proxy must NOT have (see
    // tool-proxy.factory.ts's header comment). Passing the route as `{ path, method:
    // RequestMethod.ALL }` gives it a real enum value, which resolves to `app.all` — the
    // non-stripping form. Found and fixed during implementation via a live 404 (the gate
    // middleware ran and set its cookie correctly, proving the route matched, but the proxy
    // middleware behind it saw `req.url` already collapsed to `/`) — verify this still holds if
    // this pattern is ever copied elsewhere.
    consumer
      .apply(
        AdminAuthGateMiddleware,
        createToolProxyMiddleware(grafanaTarget, '/admin/grafana'),
      )
      .forRoutes({ path: 'admin/grafana{/*path}', method: RequestMethod.ALL });

    consumer
      .apply(
        AdminAuthGateMiddleware,
        createToolProxyMiddleware(kafkaUiTarget, '/admin/kafka-ui'),
      )
      .forRoutes({
        path: 'admin/kafka-ui{/*path}',
        method: RequestMethod.ALL,
      });
  }
}

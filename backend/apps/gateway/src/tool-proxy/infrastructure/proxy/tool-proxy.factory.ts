import { createProxyMiddleware } from 'http-proxy-middleware';
import type { Request, Response } from 'express';

/**
 * Builds a streaming reverse-proxy middleware for one admin tool (Grafana, Kafka UI, ...) — see
 * docs/planning/02-admin-dashboard-plan.md. `changeOrigin` rewrites the outgoing Host header to
 * the target's own origin; `ws: true` lets Grafana Live's websocket traffic ride the same proxy.
 *
 * **Forwards the request path verbatim — no `pathRewrite`.** Nest binds route-scoped middleware
 * via `app.all(path, ...)` (see `RouterMethodFactory`'s `RequestMethod.ALL` -> `'all'` mapping),
 * not Express's `app.use(path, subApp)` mount form — the latter rewrites `req.url` relative to
 * the mount point before the middleware ever sees it (confirmed empirically: `app.use('/x', fn)`
 * strips the prefix, `app.all('/x', fn)` does not). Because the actual binding here is the
 * `app.all` form, `req.url` arrives with the full `/admin/<tool>/...` prefix still attached, which
 * is exactly what Grafana/Kafka UI expect once they're configured for their own sub-path
 * (`GF_SERVER_SERVE_FROM_SUB_PATH` / `SERVER_SERVLET_CONTEXT_PATH`) — don't add a `pathRewrite`
 * here without changing that config too, or the two will disagree about who strips the prefix.
 *
 * `pathFilter` is set explicitly, scoped to `prefix` — **not left at http-proxy-middleware's own
 * default (`'/'`, i.e. "match everything")**. Reason: `ws: true` makes this middleware
 * self-subscribe to the underlying HTTP server's own `'upgrade'` event the first time an HTTP
 * request through it runs (see http-proxy-middleware's `catchUpgradeRequest`) — that subscription
 * is server-wide, not scoped to the Nest route this factory's output gets bound to. An unscoped
 * (default) `pathFilter` would make that subscription intercept *every* websocket upgrade on the
 * Gateway, including Socket.IO's own `/ws` handshake (`realtime/api/realtime.gateway.ts`) —
 * silently hijacking realtime connections to whichever admin tool's proxy happened to run first.
 * Found and fixed during implementation, not in the original plan's example call — flagging here
 * since it's exactly the kind of thing worth not re-breaking later.
 */
export function createToolProxyMiddleware(target: string, prefix: string) {
  return createProxyMiddleware<Request, Response>({
    target,
    changeOrigin: true,
    ws: true,
    pathFilter: (pathname) =>
      pathname === prefix || pathname.startsWith(`${prefix}/`),
  });
}

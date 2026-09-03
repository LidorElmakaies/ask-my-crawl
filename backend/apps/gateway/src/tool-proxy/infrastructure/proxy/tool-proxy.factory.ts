import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import type { Request, Response } from 'express';

// Streaming reverse proxy for one admin tool (Grafana, Kafka UI, ...) — see
// docs/planning/02-admin-dashboard-plan.md for why each option here is set the way it is.
export function createToolProxyMiddleware(target: string, prefix: string) {
  return createProxyMiddleware<Request, Response>({
    target,
    changeOrigin: true,
    ws: true,
    pathFilter: (pathname) =>
      pathname === prefix || pathname.startsWith(`${prefix}/`),
    on: { proxyReq: fixRequestBody },
  });
}

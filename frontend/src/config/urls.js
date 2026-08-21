// Single source of truth for the deployment's public origin lives in devops/.env.example
// (PUBLIC_ORIGIN) — the Dockerized build (frontend/Dockerfile) bakes it in as
// EXPO_PUBLIC_GATEWAY_ORIGIN (Expo inlines any EXPO_PUBLIC_* var into the client bundle at build
// time). Falls back to the same localhost default for the bare `npx expo start` dev-server loop,
// which isn't part of that build-arg plumbing — set the env var yourself if you ever need a local
// dev server pointed at a non-local Gateway.
const BASE_URL = process.env.EXPO_PUBLIC_GATEWAY_ORIGIN ?? 'http://localhost:8000';

export const URLS = {
  base: BASE_URL,
  gateway: {
    scrape: `${BASE_URL}/api/scrape`,
    // Socket.IO connects via the HTTP origin + a path, not a ws:// URL — see
    // docs/specs/api-contracts.md.
    wsOrigin: BASE_URL,
    wsPath: '/ws',
  },
  // The Gateway now proxies /auth/*, /me, /admin/users* to Auth Service (docs/specs/services.md)
  // — this is the Gateway's own origin, same as `base`, not Auth Service's. The frontend never
  // talks to Auth Service (or any backend service) directly; only through the Gateway. This used
  // to be Auth Service's own origin as a documented stopgap — that's gone now, this is the whole
  // reason it was kept as a separate config entry instead of being inlined as `base` everywhere.
  auth: {
    origin: BASE_URL,
  },
  // Gated admin-only surface (docs/planning/02-admin-dashboard-plan.md) — all proxied through the
  // Gateway, same origin as everything else, never a direct service origin. grafana/kafkaUi are
  // WebView destinations (trailing slash matters — Grafana/Kafka UI are configured to serve from
  // exactly this sub-path); token-appending for them happens where they're opened, not baked in
  // here, since the token itself doesn't belong in a static config file.
  admin: {
    users: `${BASE_URL}/admin/users`,
    grafana: `${BASE_URL}/admin/grafana/`,
    kafkaUi: `${BASE_URL}/admin/kafka-ui/`,
  },
};

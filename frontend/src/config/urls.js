const BASE_URL = 'http://localhost:8000';

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
};

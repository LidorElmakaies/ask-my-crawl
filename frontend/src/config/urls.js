const BASE_URL = 'http://localhost:8000';

// Auth Service's own origin — the Gateway doesn't proxy /auth/* yet (see docs/specs/services.md),
// so authService.js calls this directly instead of going through BASE_URL. Once the Gateway proxy
// exists, this should be the only line that needs to change.
const AUTH_ORIGIN = 'http://localhost:8001';

export const URLS = {
  base: BASE_URL,
  gateway: {
    scrape: `${BASE_URL}/api/scrape`,
    // Socket.IO connects via the HTTP origin + a path, not a ws:// URL — see
    // docs/specs/api-contracts.md.
    wsOrigin: BASE_URL,
    wsPath: '/ws',
  },
  auth: {
    origin: AUTH_ORIGIN,
  },
};

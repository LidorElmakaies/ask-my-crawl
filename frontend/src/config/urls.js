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
};

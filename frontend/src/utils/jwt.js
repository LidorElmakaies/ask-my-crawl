// Minimal, dependency-free JWT payload decode. Reads claims (exp) only — never verifies the
// signature, that's the server's job. Used exclusively to decide when the client should
// proactively drop a stale token, never to trust the token's contents for anything
// security-sensitive (the server re-validates on every real request regardless).

export function decodeJwtPayload(token) {
  try {
    const [, payload] = token.split('.');
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json =
      typeof atob === 'function'
        ? atob(base64)
        : Buffer.from(base64, 'base64').toString('utf-8'); // RN/Metro polyfills atob; this is a fallback, not the primary path
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// docs/specs/auth.md: access tokens are 15-min TTL, payload { sub, role, exp }.
export function isTokenExpired(token) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true; // unparseable/malformed — treat as invalid, not as "fine"
  return Date.now() >= payload.exp * 1000;
}

// Milliseconds until the token's exp claim is reached (0 if already past/unparseable).
export function msUntilExpiry(token) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return 0;
  return Math.max(0, payload.exp * 1000 - Date.now());
}

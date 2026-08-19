export type ProxyMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

// Use-case I/O shapes for the one thing this module does — forward a request to Auth Service and
// hand back exactly what it returned. Not domain models (no life outside this one operation), so
// they live here beside the interface that uses them, not in a top-level models/ folder — see
// docs/specs/backend-architecture.md's "not every plain data shape is a domain model" section.
export interface ProxyRequest {
  method: ProxyMethod;
  /** Auth Service's own path, e.g. '/auth/register', '/me', '/admin/users/<id>'. */
  path: string;
  body?: unknown;
  /** Forwarded verbatim when present. Omitted for /auth/* routes — those need no token. */
  authorizationHeader?: string;
}

export interface ProxyResponse {
  status: number;
  body: unknown;
}

/**
 * Implemented by AuthProxyService, consumed by the API layer (the three proxy controllers).
 * Deliberately a single generic operation, not one method per route — per docs/specs/services.md,
 * Gateway is "a thin proxy rather than a translation layer" for Auth Service: every route means
 * the same thing (forward this, return what came back), so one method covers all of them instead
 * of ten near-identical ones.
 */
export interface IAuthProxyService {
  forward(request: ProxyRequest): Promise<ProxyResponse>;
}

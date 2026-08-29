// DI injection tokens for the Gateway app, shared across its concern modules (realtime/,
// auth-proxy/ — see docs/specs/backend-architecture.md's "multi-concern app" section for why
// Gateway has more than one). Application-layer and Infrastructure-layer classes are only ever
// referenced by their interface + token — never imported by concrete class name outside each
// concern's own <concern>.module.ts.
//
// AUTH_TOKEN_SERVICE lives in @app/auth-kernel (shared across apps) — not redeclared here.

// realtime/
export const REALTIME_CONNECTION_SERVICE = Symbol('IRealtimeConnectionService');
export const CONNECTION_STORE = Symbol('IConnectionStore');

// auth-proxy/
export const AUTH_PROXY_SERVICE = Symbol('IAuthProxyService');
export const AUTH_SERVICE_CLIENT = Symbol('IAuthServiceClient');

// jobs-proxy/
export const JOBS_PROXY_SERVICE = Symbol('IJobsProxyService');
export const JOB_SERVICE_CLIENT = Symbol('IJobServiceClient');
export const JOB_REQUESTS_PUBLISHER = Symbol('IJobRequestsPublisher');

// tool-proxy/ — no tokens of its own. AdminAuthGateMiddleware depends directly on
// AUTH_TOKEN_SERVICE (@app/auth-kernel); there's no new business logic here to put behind an
// interface (see tool-proxy.module.ts's header comment).


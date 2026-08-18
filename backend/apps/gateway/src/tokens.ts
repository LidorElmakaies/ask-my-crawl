// DI injection tokens for the Gateway app. Application-layer and Infrastructure-layer classes
// are only ever referenced by their interface + token — never imported by concrete class name
// outside gateway.module.ts. See docs/specs/backend-architecture.md.
//
// AUTH_TOKEN_SERVICE lives in @app/auth-kernel (shared across apps) — not redeclared here.

export const REALTIME_CONNECTION_SERVICE = Symbol('IRealtimeConnectionService');
export const CONNECTION_STORE = Symbol('IConnectionStore');

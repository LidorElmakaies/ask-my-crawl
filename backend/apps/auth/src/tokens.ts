// DI injection tokens for the Auth Service app. Application-layer and Infrastructure-layer
// classes are only ever referenced by their interface + token — never imported by concrete
// class name outside auth.module.ts. See docs/specs/backend-architecture.md.
//
// AUTH_TOKEN_SERVICE / JWT_SERVICE live in @app/auth-kernel (shared across apps) — not
// redeclared here.

export const AUTH_SERVICE = Symbol('IAuthService');
export const USER_SERVICE = Symbol('IUserService');
export const USER_REPOSITORY = Symbol('IUserRepository');
export const REFRESH_TOKEN_REPOSITORY = Symbol('IRefreshTokenRepository');
export const PASSWORD_HASHER = Symbol('IPasswordHasher');

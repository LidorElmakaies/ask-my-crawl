// DTOs genuinely shared across services — currently: request DTOs for routes that Gateway
// proxies to Auth Service, and the response shape both sides need to agree on. See
// docs/specs/backend-architecture.md's "DTOs" section for what belongs here vs. what stays
// local to one app's api/dto/.
export * from './auth/login.dto';
export * from './auth/refresh-token.dto';
export * from './auth/register.dto';
export * from './auth/update-me.dto';
export * from './auth/update-user-admin.dto';
export * from './auth/user-response.dto';

// Lives here (not in Auth Service's models/) because role is baked into the JWT itself — every
// app that signs/verifies tokens via this lib needs the same type, not just Auth Service.
export type UserRole = 'admin' | 'user';

const USER_ROLES: readonly UserRole[] = ['admin', 'user'];

/**
 * Runtime check that a decoded JWT's `role` claim is actually one of our roles, not just any
 * string — a token is only as trustworthy as what we validate out of it. Used by
 * JsonWebTokenService.verify() so a malformed/forged role claim is rejected outright rather
 * than silently trusted.
 */
export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && USER_ROLES.includes(value as UserRole);
}

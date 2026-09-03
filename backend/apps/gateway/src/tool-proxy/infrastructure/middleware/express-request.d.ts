import type { AuthTokenPayload } from '@app/auth-kernel';

// See docs/planning/05-grafana-jwt-auth.md.
declare global {
  namespace Express {
    interface Request {
      adminIdentity?: AuthTokenPayload;
    }
  }
}

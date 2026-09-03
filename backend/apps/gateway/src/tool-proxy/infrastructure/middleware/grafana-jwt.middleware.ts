import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';

// Must match GF_AUTH_JWT_HEADER_NAME in devops/observability/docker-compose.yml.
export const GRAFANA_JWT_HEADER = 'X-Grafana-JWT';

// See docs/planning/05-grafana-jwt-auth.md.
export function createGrafanaJwtMiddleware(privateKey: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const identity = req.adminIdentity;
    if (identity) {
      req.headers[GRAFANA_JWT_HEADER.toLowerCase()] = jwt.sign(
        { sub: identity.userId, role: 'Admin' },
        privateKey,
        { algorithm: 'RS256', expiresIn: '2m' },
      );
    }
    next();
  };
}

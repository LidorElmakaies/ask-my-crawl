import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AUTH_TOKEN_SERVICE } from '@app/auth-kernel';
import type { IAuthTokenService } from '@app/auth-kernel';

// Same cookie for both tools — one gate, scoped to /admin, guards both Grafana and Kafka UI.
export const ADMIN_PROXY_COOKIE_NAME = 'admin_proxy_session';

// Matches the access token's own TTL (docs/specs/auth.md) — the cookie just re-carries the same
// JWT (verified fresh on every request, no server-side session store), so there's no reason for
// it to outlive the token it wraps.
const COOKIE_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * Gateway-level admin gate in front of the Grafana/Kafka UI reverse proxies (tool-proxy.factory.ts)
 * — see docs/planning/02-admin-dashboard-plan.md, Decision 2, for the full reasoning. A WebView
 * navigating straight to a proxied URL can't attach a custom `Authorization` header the way this
 * app's `fetch()` calls do, and once Grafana/Kafka UI's own JS starts issuing its *own*
 * sub-resource requests, neither can those — so the token travels as a query param on the very
 * first navigation only, gets verified here, and is upgraded into a same-origin httpOnly cookie
 * that every later request (ours or the proxied app's own) carries automatically.
 *
 * Priority order matters: query param (first hit) -> cookie (every hit after) -> Authorization
 * header (so a plain authorizedFetch()-style caller still works, same as every other guarded
 * route). Whichever source is missing/invalid falls through to the next.
 */
@Injectable()
export class AdminAuthGateMiddleware implements NestMiddleware {
  constructor(
    @Inject(AUTH_TOKEN_SERVICE)
    private readonly authTokenService: IAuthTokenService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const queryToken = this.tokenFromQuery(req);
    const token =
      queryToken ?? this.tokenFromCookie(req) ?? this.tokenFromHeader(req);
    const identity = await this.authTokenService.verify(token);

    if (!identity) {
      res.status(401).json({
        error: {
          code: 'unauthorized',
          message: 'Missing or invalid access token',
        },
      });
      return;
    }
    if (identity.role !== 'admin') {
      res
        .status(403)
        .json({ error: { code: 'forbidden', message: 'Admin role required' } });
      return;
    }

    // Only upgrade to a cookie when the token actually arrived via query param — a request
    // already authenticated via the cookie or a header doesn't need (or shouldn't get) its
    // expiry silently extended on every request.
    if (queryToken) {
      res.cookie(ADMIN_PROXY_COOKIE_NAME, queryToken, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/admin',
        maxAge: COOKIE_MAX_AGE_MS,
      });
    }

    // See docs/planning/05-grafana-jwt-auth.md.
    req.adminIdentity = identity;

    next();
  }

  private tokenFromQuery(req: Request): string | null {
    const token = req.query.token;
    return typeof token === 'string' && token.length > 0 ? token : null;
  }

  private tokenFromCookie(req: Request): string | null {
    // No cookie-parser dependency for one known cookie name (see the plan doc's Decision 2) —
    // req.headers.cookie is a raw `"a=1; b=2"` string, parsed by hand.
    const header = req.headers.cookie;
    if (!header) return null;
    for (const part of header.split(';')) {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex === -1) continue;
      const name = part.slice(0, separatorIndex).trim();
      if (name === ADMIN_PROXY_COOKIE_NAME) {
        return decodeURIComponent(part.slice(separatorIndex + 1).trim());
      }
    }
    return null;
  }

  private tokenFromHeader(req: Request): string | null {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    return header.slice('Bearer '.length);
  }
}

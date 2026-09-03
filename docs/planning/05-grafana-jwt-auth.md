# Grafana: JWT auth

Grafana authenticates every request that reaches it through the Gateway's tool-proxy via a signed
JWT, not anonymous access. Every such request already passed `AdminAuthGateMiddleware` (app-admin
only), so the Grafana token's role claim is always the literal Grafana org role `"Admin"` — there's
no separate tier to map, since anyone who clears the gate gets full Grafana access.

## Design

- **Separate keypair from the app's own `JWT_SECRET`.** RS256, not HS256 — Grafana only ever holds
  the *public* key, so nothing on the Grafana side can mint tokens, and a compromise of one keypair
  can't be used to forge the other.
- **Minted fresh per proxied request, as a header (`X-Grafana-JWT`), never a query param or
  cookie.** `GrafanaJwtMiddleware` runs right after `AdminAuthGateMiddleware`, reads the identity
  it attaches to the request, and signs a ~2-minute-lived token into the outgoing proxied request
  only — it never appears in a URL or access log, unlike the app-level admin-proxy-session token
  (see [../diagrams/admin-proxy-sequence.md](../diagrams/admin-proxy-sequence.md)).
- **`sub` claim is the app user's id, not their email** — `AUTH_TOKEN_SERVICE.verify()` doesn't
  carry email, so Grafana shows each admin by their user id rather than a name.
- **Anonymous access and Grafana's own login form are both off.** Grafana has no published host
  port (`02-admin-dashboard-plan.md`'s Decision 4) — the only way to reach it is through the
  Gateway's gated proxy, which always attaches a valid JWT.
- **Kafka UI is untouched** — it has no comparable JWT auth mode; it's reachable through the same
  Gateway gate with no further identity check on its own side.

## Keypair

`devops/observability/docker-compose.yml`'s `grafana-jwt-keygen` one-off container generates an
RSA keypair into a pinned Docker volume (`grafana-jwt-keys`) on first boot if it doesn't already
exist — same one-off-init shape as `kafka-init`/`seaweedfs-init`. Grafana mounts the volume
read-only for the public key (`GF_AUTH_JWT_KEY_FILE`); the Gateway mounts the same volume
read-only from the other Compose project via `external: true` (the same cross-project pattern the
`observability` Docker network already uses). The documented startup order (observability stack
before the app stack, root `CLAUDE.md`) guarantees the keypair exists before either side needs it.

## Extending to a real Editor tier

If this app ever grows a Grafana-facing role distinct from plain admin-dashboard access, map it
into the JWT's `role` claim (`Viewer`/`Editor`/`Admin`) instead of the hardcoded `"Admin"` — no
other part of this design would need to change.

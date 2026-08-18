# Auth

**Implemented** — Auth Service (`backend/apps/auth`), TypeORM against Postgres, following the
clean-architecture layering in `backend-architecture.md`. Runs standalone on port 8001 today; not
yet proxied through the Gateway (see `services.md` / `api-contracts.md`).

## Roles

`admin` and `user` (Postgres enum `user_role`, on `users.role`). No further granularity for v1.

| | Own profile/results | All users | All requests/results |
|---|---|---|---|
| **user** | read + update | — | — |
| **admin** | read + update | list, view, update, delete | read all |

## Registration

`POST /auth/register` — `email`, `password` required (password ≥ 8 chars); `name`, `phone_number`,
and `telegram_chat_id` optional at registration (SMS/Telegram notifications simply won't fire for a
user missing the relevant field — no hard requirement to supply them up front). `email` is
lowercased before storage/lookup, so case doesn't create duplicate accounts. All new registrations
get `role: 'user'`; there is no public path to create an `admin`.

**First-admin bootstrap — resolved: env-based auto-seed.** On Auth Service startup
(`AdminSeedService`), if `ADMIN_EMAIL`/`ADMIN_PASSWORD` are both set and no admin exists yet: promote
that user to admin if already registered, otherwise create the account. A no-op once any admin
exists, so the env vars are safe to leave set permanently rather than needing to be unset after
first boot.

**Telegram linking**: `telegram_chat_id` isn't something a user simply knows — it's obtained by
starting a chat with our bot. Exact flow (deep-link with an embedded linking code vs. a manual
"send `/link <code>` to the bot" step) is not yet decided; flagging as open.

## Password hashing

Per spec: **salt + pepper + SHA-256** (not bcrypt/argon2/scrypt — flagging once, for the record, that
this has no built-in work factor and is comparatively fast to brute-force even salted; keeping as
specified).

```
password_hash = SHA256(PEPPER + password_salt + plaintext_password)
```

- `password_salt`: random per-user (e.g. 16+ bytes, hex-encoded), generated at registration, stored
  in `users.password_salt` — not secret, its only job is making precomputed rainbow tables useless.
- `PEPPER`: a single server-side secret (env var / secrets manager), **never stored in the
  database**, same value for every user. Losing the pepper (e.g. via source leak) removes its
  protection; losing the DB alone does not reveal it.
- Fixed concatenation order (`PEPPER + salt + password`) — must be identical between registration and
  login or every login fails.

## Tokens

- **Access token**: JWT, **15 min** TTL, payload `{ sub: user_id, role, exp }`, signed with
  `JWT_SECRET` via `@app/auth-kernel` (shared lib — see `backend-architecture.md`). Gateway verifies
  signature + expiry **locally**, no DB/network round-trip per request (see `api-contracts.md`).
- **Refresh token**: opaque random string (`crypto.randomBytes(32).toString('hex')`), **30 day**
  TTL, returned to the client alongside the access token. Server stores only its SHA-256 hash (no
  salt/pepper needed — the token is already high-entropy random, not human-guessable) in
  `refresh_tokens`, so a leaked DB doesn't hand out usable tokens. Rotated on every use
  (`POST /auth/refresh` revokes the old row and issues a new pair) — a stolen-and-replayed refresh
  token only ever works once; the legitimate client's next refresh attempt with the now-revoked
  token fails loudly, a signal worth acting on later (not yet — no alerting exists for it).
- **Logout**: marks the given refresh token's `revoked_at`. Access tokens already issued remain valid
  until they naturally expire (no server-side access-token revocation list for v1) — acceptable given
  the short access-token lifetime.
- **Role changes take effect on next login, not retroactively** — role lives inside the JWT payload,
  so an admin promoting/demoting a user via `PATCH /admin/users/:id` doesn't affect that user's
  already-issued access token until it expires (≤15 min) or they log in again.

## Gateway enforcement

Every non-`/auth/*` request requires `Authorization: Bearer <access_token>`. Missing, malformed, or
expired → `401`, client is expected to call `/auth/refresh`. Role check (`admin` vs `user`) happens
per-route via a NestJS guard reading the JWT payload's `role` claim.

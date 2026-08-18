# Auth

## Roles

`admin` and `user` (Postgres enum `user_role`, on `users.role`). No further granularity for v1.

| | Own profile/results | All users | All requests/results |
|---|---|---|---|
| **user** | read + update | — | — |
| **admin** | read + update | list, view, update, delete | read all |

## Registration

`POST /auth/register` — `email`, `password` required; `phone_number` and `telegram_chat_id` optional
at registration (SMS/Telegram notifications simply won't fire for a user missing the relevant field
— no hard requirement to supply them up front). All new registrations get `role: 'user'`; there is no
public path to create an `admin`.

**First-admin bootstrap**: not yet decided — needs one of: a seed script run at deploy time, a
one-time admin-creation CLI command, or a promotion path where an existing admin sets another user's
role via `PATCH /admin/users/:id`. Flagging as open, not blocking the rest of the spec.

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

- **Access token**: JWT, short-lived (proposed 15 min), payload `{ sub: user_id, role, exp }`, signed
  with a server secret. Gateway verifies signature + expiry **locally**, no DB/network round-trip per
  request (see `api-contracts.md`).
- **Refresh token**: opaque random string, long-lived (proposed 7–30 days), returned to the client
  alongside the access token. Server stores only its hash, in `refresh_tokens`, so a leaked DB doesn't
  hand out usable tokens. Rotated on every use (`POST /auth/refresh` issues a new refresh token and
  invalidates the old one) — limits the damage window if a refresh token is stolen.
- **Logout**: marks the given refresh token's `revoked_at`. Access tokens already issued remain valid
  until they naturally expire (no server-side access-token revocation list for v1) — acceptable given
  the short access-token lifetime.

## Gateway enforcement

Every non-`/auth/*` request requires `Authorization: Bearer <access_token>`. Missing, malformed, or
expired → `401`, client is expected to call `/auth/refresh`. Role check (`admin` vs `user`) happens
per-route via a NestJS guard reading the JWT payload's `role` claim.

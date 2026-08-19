# API Contracts

All HTTP surface is **meant to be** exposed through the **Gateway** — no other service reachable
directly from the frontend. **Current implementation status:** Auth Service is built and these
routes are real, but it currently runs standalone on its own port (`8001`) — the Gateway does not
yet proxy `/auth/*`, `/me`, `/admin/users*` to it (tracked as the next piece of work; see
`services.md`). **Until that proxy exists, the frontend calls Auth Service directly** at its own
origin (`http://localhost:8001`) for every route in this section — see `frontend/CLAUDE.md`'s
"HTTP API" section. CORS is enabled permissively (`origin: true`) on both Gateway and Auth Service
to support this during the Docker Compose dev phase — lock down to specific origins before any real
deployment. Error responses use `{ "error": { "code": "string", "message": "string" } }`.

## Auth

None of these require an access token (they're how you get one).

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/register` | `{ email, password, name?, phone_number?, telegram_chat_id? }` | `201` → `{ user, access_token, refresh_token }` |
| POST | `/auth/login` | `{ email, password }` | `200` → `{ user, access_token, refresh_token }` |
| POST | `/auth/refresh` | `{ refresh_token }` | `200` → `{ access_token, refresh_token }` (rotated — the old refresh token is revoked) |
| POST | `/auth/logout` | `{ refresh_token }` | `204` — revokes the refresh token |

`user` shape: `{ id, email, name, role, phone_number, telegram_chat_id }` (never includes hash/salt).
`email` is always lowercased server-side, so `Bob@x.com` and `bob@x.com` are the same account
(register with the second returns `409 Conflict`). `password` must be at least 8 characters
(`400` otherwise).

## Self-service (requires valid access token, any role)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/me` | — | `200` → `user` |
| PATCH | `/me` | `{ email?, name?, phone_number?, telegram_chat_id?, password? }` | `200` → `user` |

## Jobs (requires valid access token)

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/jobs` | `{ url, query }` | `202` → `{ job }` with `status: "pending"`. Gateway creates the job row (via internal call to Crawl Result Manager) and publishes the seed `crawl-frontier` message before responding. |
| GET | `/jobs` | — | User: own jobs only. Admin: all jobs, with optional `?user_id=` filter. |
| GET | `/jobs/:id` | — | User: 403 if not their own job. Admin: any job. Includes nested `result` once `status: "completed"`. |

`job` shape: `{ id, user_id, seed_url, query, depth_limit, status, error_message, created_at, completed_at, result? }`
`result` shape: `{ answer_text, source_page_ids, created_at }`

## Admin — user management (requires access token with `role: admin`)

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/admin/users` | — | List all users |
| GET | `/admin/users/:id` | — | `404` if not found |
| PATCH | `/admin/users/:id` | `{ email?, phone_number?, role? }` | Role changes only via this endpoint, not `/me`. Since role lives inside the JWT payload, a role change only takes effect on that user's *next* login (their current access token still carries the old role until it expires) |
| DELETE | `/admin/users/:id` | — | `204`, `404` if not found |

## WebSocket (Socket.IO)

Not a raw WebSocket — **Socket.IO**, chosen over raw `ws` for free auto-reconnect-with-backoff and
the ability to reject an unauthenticated handshake outright (client gets `connect_error`) rather
than accepting the connection and closing it immediately after.

- Connect to the Gateway's HTTP origin, path `/ws`, `transports: ['websocket']` (skip long-polling
  — this deployment is always reachable directly over WS, no need for the fallback).
- Token sent as `auth: { token: <access_token> }` in the client handshake — not a query param,
  not a header.
- Invalid/missing token → the server's connection middleware calls `next(new Error('Unauthorized'))`
  before the handshake completes → client sees `connect_error`, never `connect`.

Server → client: every event arrives on a single `message` event, payload shaped exactly as below
(the `type` field disambiguates, kept identical to what `event-schemas.md`'s `result-saved` topic
carries, regardless of transport):

```jsonc
// on job completion, matches the result-saved Kafka event
{ "type": "job.completed", "job_id": "uuid", "answer_text": "string", "completed_at": "ISO8601" }

// optional, if we want live progress rather than just a final push
{ "type": "job.status", "job_id": "uuid", "status": "crawling" | "answering" }
```

No client → server messages are required for v1 — the socket is push-only. Frontend implementation:
`frontend/src/services/socketService.js` (the only file allowed to import `socket.io-client`),
orchestrated by `wsSlice`'s thunks, auto-connected by `app/_layout.js`'s
`RealtimeConnectionManager` whenever the stored access token changes — see `frontend/CLAUDE.md`'s
"Services Layer" / "WebSocket (Socket.IO)" sections.

## Token handling (Gateway behavior)

For every request other than `/auth/*`: Gateway verifies the `Authorization: Bearer <token>` JWT
signature and expiry **locally** (no network call to Auth Service on every request). Only when a
token is missing, malformed, or expired does the client need to hit `/auth/refresh` (or
`/auth/login` again) — that's the "routed to auth service" path. See `auth.md` for the token
strategy itself.

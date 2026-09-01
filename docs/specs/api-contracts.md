# API Contracts

All HTTP surface is exposed through the **Gateway** — no other service reachable directly from the
frontend, including Auth Service: the Gateway proxies `/auth/*`, `/me`, `/admin/users*` to it
(`backend/apps/gateway/src/auth-proxy/`), and the frontend only ever talks to the Gateway's origin
(`http://localhost:8000`). Auth Service still runs on its own port (`8001`), but that's now purely
server-to-server (Gateway → Auth Service), not something the frontend calls. CORS is enabled
permissively (`origin: true`) on the Gateway for the Docker Compose dev phase — lock down to
specific origins before any real deployment. **Error responses documented as `{ "error": { "code":
"string", "message": "string" } }` below don't match what Auth Service actually returns** — it's
Nest's default `{ message, error, statusCode }` shape (`message` a string or an array of
validation failures), relayed verbatim through the Gateway proxy since it's a thin pass-through,
not a translation layer. Flagged as a real spec/implementation mismatch worth reconciling, not
silently resolved here — see `frontend/src/services/apiError.js` for how the frontend copes with
both shapes.

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
| POST | `/jobs` | `{ url, query }` | `202` → `{ status: "accepted" }` — **no `job_id`**. Gateway does not call Job Manager Service synchronously here — it publishes a `job-requests` Kafka message and returns immediately, before any job row exists to hand back an id for. The frontend learns the real `job_id` asynchronously via a `job.created` WebSocket push (see the WebSocket section below) once Job Manager Service has actually created the row. (This response's `status: "accepted"` is just an ack literal — unrelated to the `jobs` row, which has no `status` column at all, see below.) `url` max 2048 chars; `query` max 500 chars and restricted to English/Hebrew letters, digits, and basic punctuation (`400` otherwise) — enforced by `CreateJobRequestDto` (`backend/apps/gateway/src/jobs-proxy/api/dto/create-job-request.dto.ts`), the only place this is checked server-side since no other service is reachable from outside the Gateway. The query charset allowlist exists specifically to stop Unicode-smuggling prompt injection (invisible Unicode Tag characters riding on an emoji, zero-width/bidi tricks) from ever reaching the RAG prompt Query/Answer Service builds — see `docs/planning/01-architecture-notes.md`. The frontend (`frontend/src/utils/validation.js`) enforces the same two rules for immediate feedback, but that's UX only, not the boundary — this DTO is. |
| GET | `/jobs` | — | User: own jobs only. Admin: all jobs, with optional `?user_id=` filter. Unaffected by the above — still a synchronous internal call to Job Manager Service, this is a read, not the write path being decoupled. |
| GET | `/jobs/:id` | — | User: 403 if not their own job. Admin: any job. `result` is `null` until the answer is ready — that's the only "is it done" signal now, see below. Same as above — still synchronous. |
| POST | `/jobs/:id/retry` | — | User: 403 if not their own job. Admin: any job. `202` on success — clears `failed_reason` and republishes `crawl-complete` with a fresh retry budget, no re-crawl (Qdrant chunks are untouched). `404` if the job doesn't exist, `409` if it has no `failed_reason` to retry. |

`job` shape: `{ id, user_id, url, query, result, failed_reason }` — `result` is the answer text,
`null` until Query/Answer Service finishes; `failed_reason` is `null` unless Query/Answer gave up,
in which case `result` stays `null`. No `status`/timestamps fields, and both are plain
string-or-null fields directly on `job`, not a nested object. Source attribution isn't persisted
anywhere — see `data-model.md`'s `jobs` table for the full list of what this table does and doesn't
track.

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
// once Job Manager Service has actually created the job row — matches the job-created Kafka
// event. This is the ONLY way the frontend learns job_id: POST /jobs (above) responds before the
// row exists and never returns one. If the client isn't connected when this fires, it only finds
// out about the job via a later GET /jobs listing it — same gap as job.completed below.
{ "type": "job.created", "job_id": "uuid", "user_id": "uuid", "url": "string", "query": "string" }

// on job completion, matches the result-saved Kafka event — exactly one of result/failed_reason
// is set, never both
{ "type": "job.completed", "job_id": "uuid", "result": "string | null", "failed_reason": "string | null" }
```

No `job.status` progress event — the `jobs` table has no `status` column, so there's no in-between
state to report. A client only ever learns "created" (job.created) and "done" (job.completed, which
now distinguishes success from failure via `failed_reason`).

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

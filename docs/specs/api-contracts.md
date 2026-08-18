# API Contracts

All HTTP surface is exposed through the **Gateway** — no other service is reachable directly from
the frontend. Error responses use `{ "error": { "code": "string", "message": "string" } }`.

## Auth

None of these require an access token (they're how you get one).

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/register` | `{ email, password, phone_number?, telegram_chat_id? }` | `201` → `{ user, access_token, refresh_token }` |
| POST | `/auth/login` | `{ email, password }` | `200` → `{ user, access_token, refresh_token }` |
| POST | `/auth/refresh` | `{ refresh_token }` | `200` → `{ access_token, refresh_token }` (rotated) |
| POST | `/auth/logout` | `{ refresh_token }` | `204` — revokes the refresh token |

`user` shape: `{ id, email, role, phone_number, telegram_chat_id }` (never includes hash/salt).

## Self-service (requires valid access token, any role)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/me` | — | `200` → `user` |
| PATCH | `/me` | `{ email?, phone_number?, telegram_chat_id?, password? }` | `200` → `user` |

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
| GET | `/admin/users/:id` | — | |
| PATCH | `/admin/users/:id` | `{ email?, phone_number?, role? }` | Role changes only via this endpoint, not `/me` |
| DELETE | `/admin/users/:id` | — | `204` |

## WebSocket

Single endpoint: `ws(s)://<gateway>/ws?token=<access_token>` (or `Authorization` header if the
client library supports it on the WS upgrade request). Gateway verifies the token the same way as
HTTP requests before accepting the upgrade.

Server → client events:

```jsonc
// on job completion, matches the result-saved Kafka event
{ "type": "job.completed", "job_id": "uuid", "answer_text": "string", "completed_at": "ISO8601" }

// optional, if we want live progress rather than just a final push
{ "type": "job.status", "job_id": "uuid", "status": "crawling" | "answering" }
```

No client → server messages are required for v1 — the socket is push-only. Reconnection/backoff is
a frontend concern (see `frontend/CLAUDE.md`'s eventual WS integration notes once written).

## Token handling (Gateway behavior)

For every request other than `/auth/*`: Gateway verifies the `Authorization: Bearer <token>` JWT
signature and expiry **locally** (no network call to Auth Service on every request). Only when a
token is missing, malformed, or expired does the client need to hit `/auth/refresh` (or
`/auth/login` again) — that's the "routed to auth service" path. See `auth.md` for the token
strategy itself.

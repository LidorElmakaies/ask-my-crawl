# Services

Seven NestJS services, each owning its own slice of the data model (see `data-model.md`) — other
services reach that data only through its API or its Kafka events, never a direct cross-service
table read/write. `docs/planning/03-crawler-scraper-indexing-plan.md` has the full mechanism behind
the **Scraper** and **Indexer** sections below; this file only summarizes it.

```
                         ┌────────────────────┐
   Client (frontend) ───▶│      Gateway        │◀── WS (result-saved consumer)
                         │  HTTP + WS, guards   │
                         └──────────┬──────────┘
                     token invalid  │  token valid: publish job-requests
                          ▼         ▼
                  ┌───────────┐   crawl-frontier (Kafka) ◀─────────────────┐
                  │   Auth    │        │                                   │ child URLs
                  │  Service  │        ▼                                   │ (depth+1)
                  │(Postgres) │  ┌────────────────────┐  page-scraped  ┌───┴────────────┐
                  └───────────┘  │      Scraper        │────(Kafka)───▶│    Indexer      │
                                  │ (Redis + SeaweedFS) │                │ (Redis + Milvus)│
                                  └──────────────────────┘                └────────┬────────┘
                                                                                    │ crawl-complete
                                                                                    ▼
                                  ┌──────────────┐──▶ Indexer (similarity search, TBD)
                                  │ Query/Answer │
                                  │   Service    │──▶ LLM (external API)
                                  └──────┬───────┘
                                         │ answer-ready
                            ┌────────────┴────────────┐
                            ▼                          ▼
                  ┌───────────────────┐      ┌──────────────────────┐
                  │ Notification Svc  │      │ Job Manager Service  │
                  │ email/SMS/Telegram│      │ (Postgres: jobs)     │
                  └───────────────────┘      └───────────┬──────────┘
                                                           │ result-saved
                                                           ▼
                                                      Gateway (WS push)
```

Both `crawl-frontier` (the Scraper re-publishes child URLs back onto it) and `crawl-complete`
(produced by **either** the Scraper or the Indexer, whichever component's counter-decrement
observes both `pending_scrape` and `pending_index` at zero and wins the `SET NX` race guard — not
always the Indexer) are simplified above; see the planning doc's diagram and "Completion detection"
section for the exact mechanism.

## Gateway

- **Owns**: nothing in Postgres — stateless HTTP/WS edge.
- **Responsibilities**: terminate HTTP + WebSocket connections; verify JWT locally (see `auth.md`);
  proxy `/auth/*` to Auth Service; on `POST /jobs`, publish a `job-requests` message and respond
  `202` immediately — no synchronous call to Job Manager Service, no `job_id` yet (see
  `api-contracts.md`); on `GET /jobs*`, call Job Manager Service internally; on
  `GET/PATCH /admin/users*`, call Auth Service internally; maintain an in-memory (or Redis-backed,
  for multi-instance deployments) `user_id → WebSocket` registry; consume `job-created` and
  `result-saved`, pushing each to the matching connection as `job.created` / `job.completed`
  respectively (`api-contracts.md`'s WebSocket section).
- **Talks to**: Auth Service (internal call), Job Manager Service (internal call — read path only,
  `GET /jobs*`), Kafka (produces `job-requests`, consumes `job-created` and `result-saved`).

## Auth Service

**Implemented** (`backend/apps/auth`) — Gateway proxies every route below (`backend/apps/gateway/
src/auth-proxy/`); Auth Service isn't reachable from the frontend directly, only from the Gateway
(still on its own port, 8001, but that's server-to-server, not browser-facing).

- **Owns**: `users`, `refresh_tokens`.
- **Responsibilities**: registration (hash password per `auth.md`), login, refresh-token issuance +
  rotation + revocation, self-service profile read/update (`/me`), admin user CRUD, first-admin
  bootstrap (env-based auto-seed on startup).
- **Talks to**: Postgres (via TypeORM) only. No Kafka involvement.

## Scraper

**Implemented** (`backend/apps/scraper`), 2026-08-28 — verified end-to-end against the live stack
(a real crawl of `info.cern.ch`: 24 pages succeeded with real blobs in SeaweedFS, 1 permanent
failure correctly classified with no wasted retries, a real `crawl-complete` summary published; a
separate test confirmed the transient-failure path genuinely retries before giving up). Full
mechanism: `docs/planning/03-crawler-scraper-indexing-plan.md`. Two internal components, one Nest
app — a single concern (fetching and BFS-expanding a job's pages) even though it's internally
complex, per `backend-architecture.md`'s "single-concern vs. multi-concern" test:

- **Frontier Consumer** — consumes every message on `crawl-frontier` (both the seed from Job
  Manager Service and every child URL the Scraper Worker re-publishes). Owns the per-job dedup gate
  (`SADD crawl:{job_id}:visited`, Redis) and enqueues onto the `process-url` BullMQ queue.
- **Scraper Worker(s)** — BullMQ workers on `process-url`. Fetch over plain HTTP (30s timeout, no
  headless browser), save raw HTML to SeaweedFS, extract and filter outbound links (same-domain,
  depth < 3), re-publish children onto `crawl-frontier`, publish `page-scraped` for the Indexer.
- **Owns**: nothing in Postgres. Shares per-job coordination state in Redis with the Indexer (dedup
  set, pending counters, completion metadata — not "owned" data in the `data-model.md` sense, see
  the planning doc).
- **Talks to**: Kafka (`crawl-frontier` in/out, `page-scraped` out, `crawl-complete` out — whichever
  of Scraper/Indexer wins the completion race), Redis (shared coordination state), SeaweedFS (raw
  HTML blob writes, S3-compatible API).

## Indexer

**Not implemented.** Full mechanism: `docs/planning/03-crawler-scraper-indexing-plan.md`. Two
internal components, one Nest app, mirroring the Scraper's shape:

- **Index Intake Consumer** — consumes `page-scraped`, bridges each message onto the `index-page`
  BullMQ queue (same Kafka→BullMQ bridge pattern as the Frontier Consumer).
- **Indexing Worker(s)** — BullMQ workers on `index-page`. Fetch the raw blob from SeaweedFS, clean
  it (LangChain document transformer), chunk it (`RecursiveCharacterTextSplitter`), embed it
  (self-hosted, via LM Studio's OpenAI-compatible API — `OpenAIEmbeddings` from `@langchain/openai`),
  delete any stale vectors for the URL, and upsert the new chunks into Milvus.
- **Owns**: nothing in Postgres — no Milvus collection is "owned" the way a Postgres table is
  either, but the Indexer is the only service that writes to it.
- **Talks to**: Kafka (`page-scraped` in, `crawl-complete` out — whichever of Scraper/Indexer wins
  the completion race), Redis (shared coordination state with the Scraper), SeaweedFS (raw HTML
  blob reads), Milvus (vector upsert/delete), LM Studio (embedding calls, local OpenAI-compatible
  HTTP API — not containerized, reached via a host address, not a compose service name).
- **Not designed**: the read/retrieval path Query/Answer Service needs at query time (a Milvus
  similarity search scoped to a `job_id`) — presumed to be an internal call to this service, but the
  request/response shape doesn't exist anywhere yet. Flag before inventing one.

## Query/Answer Service

**Not implemented.** It should, on `crawl-complete`: call the Indexer for the top-k relevant chunks
for that job's query (Milvus similarity search — request/response shape not designed, see the
Indexer section above); pass them plus the query to an LLM; publish `answer-ready`. `crawl-complete`
carries `succeeded_urls`/`failed_urls`/counts — whether/how a partial-failure crawl (some URLs
failed) should change the answer step isn't decided; flag before assuming "ignore failures, answer
from whatever indexed."

- **Owns**: nothing in Postgres.
- **Talks to**: the Indexer (internal call, not yet designed), an external LLM API (provider TBD),
  Kafka (`crawl-complete` in, `answer-ready` out).

## Notification Service

**Not implemented.** It should, on `answer-ready`: look up the user's contact info (via internal
call to Auth Service) and send email + SMS + Telegram, logging each attempt.

- **Owns**: `notifications_log`.
- **Talks to**: Auth Service (internal call, contact info), external email/SMS/Telegram providers
  (TBD), Kafka (`answer-ready` in), Postgres (`notifications_log`).

## Job Manager Service

**Implemented** (`backend/apps/job-manager`) — This is the service that turns a `job-requests` message
into a real job: it creates the `crawl-frontier` seed the Scraper's BFS depends on, manages the lifecycle
of the `jobs` table, and exposes internal `GET /jobs` and `GET /jobs/:id` endpoints for Gateway's read proxy.

- **Owns**: `jobs` — one table: `id` (generated), `user_id`, `url`, `query`, `result` (`NULL` until
  answered).
- **Responsibilities**: consumes `job-requests` (`{user_id, url, query}`); generates a `job_id` and
  inserts the `jobs` row with those 3 fields plus the new `id` and a `NULL` `result`; publishes the seed
  `crawl-frontier` message (`{job_id, user_id, url, depth: 1, query}`); publishes `job-created` so Gateway
  can relay the new `job_id` to the submitting user over WebSocket. On `answer-ready`, updates `jobs.result`
  and publishes `result-saved`. On `GET /jobs`, returns user-scoped or admin-filtered jobs.
- **Talks to**: Kafka (`job-requests` in, `crawl-frontier` seed + `job-created` out, `answer-ready`
  in, `result-saved` out), Postgres (`jobs`), Gateway (internal HTTP call, inbound — read path only,
  `GET /jobs*`).


## Internal (service-to-service) calls

**Plain HTTP**, via Nest's `HttpModule`, for every synchronous internal call listed above
(Gateway↔Auth, Gateway↔Job Manager Service, Query/Answer↔Indexer, Notification↔Auth) — not NestJS's
TCP microservice transport. (The Scraper and Indexer don't call each other synchronously at all —
they're bridged entirely by Kafka + shared Redis coordination state, per
`docs/planning/03-crawler-scraper-indexing-plan.md`.) Simpler, and each callee's controllers already
implement the relevant `api-contracts.md` paths directly, so the caller (e.g. Gateway) is a thin
proxy rather than a translation layer.

**Implemented for Gateway↔Auth Service** — a generic forward-and-relay (one `IAuthProxyService.
forward()` method behind `/auth/*`, `/me`, `/admin/users*`, not one translation method per route),
via `@nestjs/axios`'s `HttpModule`. Gateway's own `JwtAuthGuard`/`RolesGuard` (shared from
`@app/auth-kernel`, not reimplemented) reject an invalid/missing token or wrong role locally before
ever calling Auth Service — Auth Service's own guards then re-verify independently (defense in
depth, not redundant). A request crossing this hop produces a single connected distributed trace
(Gateway's span → Auth Service's span → its `pg` spans → back), not two disconnected ones — see
`backend/libs/otel`.

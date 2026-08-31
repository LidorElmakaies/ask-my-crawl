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
                                  │ (Redis + SeaweedFS) │                │ (Redis + Qdrant)│
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

`crawl-frontier` (the Scraper re-publishes child URLs back onto it) is simplified above; see the
planning doc's diagram. `crawl-complete` is produced only by the Indexer, once it observes both
`job:{job_id}:pending_scrape` and `job:{job_id}:pending_index` at zero after its own decrement — the
Scraper's own decrement never checks for completion (see the planning doc's "Completion detection"
section for why).

**Status**: Gateway, Auth Service, Job Manager Service, the Scraper, and the Indexer are
implemented — a job can be submitted, crawled, and fully indexed into Qdrant end to end. Query/Answer
Service (the RAG step: retrieve from the Indexer, call an LLM, publish `answer-ready`) and
Notification Service are not built yet — that's what's left before a submitted job actually produces
an answer back to the user.

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

**Implemented** (`backend/apps/scraper`). Full mechanism: `docs/planning/
03-crawler-scraper-indexing-plan.md`. Two internal components, one Nest app — a single concern
(fetching and BFS-expanding a job's pages) even though it's internally complex, per
`backend-architecture.md`'s "single-concern vs. multi-concern" test:

- **Frontier Consumer** — consumes every message on `crawl-frontier` (both the seed from Job
  Manager Service and every child URL the Scraper Worker re-publishes). Owns the per-job dedup gate
  (`SADD crawl:{job_id}:visited`, Redis) and enqueues onto the `process-url` BullMQ queue.
- **Scraper Worker(s)** — BullMQ workers on `process-url`. Fetch over plain HTTP (30s timeout, no
  headless browser), save raw HTML to SeaweedFS, extract and filter outbound links (same-domain,
  depth < 3), re-publish children onto `crawl-frontier`, publish `page-scraped` for the Indexer.
- **Owns**: nothing in Postgres. Shares per-job coordination state in Redis with the Indexer (dedup
  set, pending counters, completion metadata — not "owned" data in the `data-model.md` sense, see
  the planning doc).
- **Talks to**: Kafka (`crawl-frontier` in/out, `page-scraped` out — never `crawl-complete`; only
  the Indexer publishes that, see above), Redis (shared coordination state), SeaweedFS (raw HTML
  blob writes, S3-compatible API).

## Indexer

**Implemented** (`backend/apps/indexer`). Full mechanism: `docs/planning/
03-crawler-scraper-indexing-plan.md`. Two internal components, one Nest app, mirroring the Scraper's
shape:

- **Index Intake Consumer** — consumes `page-scraped`, bridges each message onto the `index-page`
  BullMQ queue (same Kafka→BullMQ bridge pattern as the Frontier Consumer). No dedup gate (unlike
  the Frontier Consumer) — each `page-scraped` message already represents one successfully-scraped
  page, not a URL that might be rediscovered many times.
- **Indexing Worker(s)** — BullMQ workers on `index-page`. Fetch the raw blob from SeaweedFS,
  strip it to plain text (`cheerio` — reused rather than pulling in `@langchain/community`'s
  heavier HTML transformer for one utility), chunk it (`RecursiveCharacterTextSplitter` from
  `@langchain/textsplitters`), embed it (self-hosted, via LM Studio's OpenAI-compatible API —
  `OpenAIEmbeddings` from `@langchain/openai`), delete any stale vectors for the URL, and upsert the
  new chunks into Qdrant. Is the **only** service that ever checks for job completion: once its own
  decrement observes both pending counters at zero and wins the `SET NX` guard (own scoped copy of
  the Redis coordination logic — see `data-model.md`), publishes `crawl-complete` with `url` = the
  job's seed URL (`page-scraped`'s `base_url` field, propagated the same way `crawl-frontier`'s
  already is). The Scraper deliberately never checks for completion itself — see
  `03-crawler-scraper-indexing-plan.md` §6.
- **Owns**: nothing in Postgres — no Qdrant collection is "owned" the way a Postgres table is
  either, but the Indexer is the only service that writes to it.
- **Talks to**: Kafka (`page-scraped` in, `crawl-complete` out — the Indexer is the only publisher
  of that topic, see above), Redis (shared coordination state with the Scraper, own scoped
  read/write surface — see `data-model.md`), SeaweedFS (raw HTML blob reads), Qdrant (vector
  upsert/delete), LM Studio (embedding calls, local OpenAI-compatible HTTP API — not containerized,
  reached via `host.docker.internal`, not a compose service name; swappable for any
  OpenAI-compatible embedding server via `EMBEDDING_BASE_URL`, no code change).
- **A real integration quirk to know about before touching this code**: LM Studio's
  `/v1/embeddings` endpoint silently returns a truncated vector (192 values instead of 768) when
  asked for `encoding_format: "base64"` — the `openai` SDK's own default — instead of erroring;
  forcing `encodingFormat: 'float'` on `OpenAIEmbeddings` bypasses the broken path entirely.
  Commented at its exact call site in `apps/indexer/src/infrastructure/langchain/`.
- **Not designed**: the read/retrieval path Query/Answer Service needs at query time (a Qdrant
  similarity search scoped to a `job_id`) — presumed to be an internal call to this service, but the
  request/response shape doesn't exist anywhere yet. Flag before inventing one.

## Query/Answer Service

**Not implemented.** It should, on `crawl-complete`: call the Indexer for the top-k relevant chunks
for that job's query (Qdrant similarity search — request/response shape not designed, see the
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
  `crawl-frontier` message (`{job_id, user_id, url, depth: MAX_CRAWL_DEPTH, query}`); publishes `job-created` so Gateway
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

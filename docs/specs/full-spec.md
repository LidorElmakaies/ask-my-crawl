# askmycrawl — Full Specification

Single-file consolidation of every spec doc in this folder plus the planning decisions behind them,
kept current as of the last edit below. The per-topic files ([data-model.md](data-model.md),
[event-schemas.md](event-schemas.md), [api-contracts.md](api-contracts.md), [services.md](services.md),
[auth.md](auth.md), [backend-architecture.md](backend-architecture.md)) still exist and go deeper on
"why" in places (cross-referenced inline below) — this file exists so the whole system fits in one
read. For diagrams (flowcharts + sequence diagrams), see [docs/diagrams/](../diagrams/README.md).

---

## 1. What this is

**askmycrawl** takes a URL and a question, crawls that URL (and same-domain pages it links to),
indexes what it reads into a vector database, answers the question using a RAG pipeline over an
LLM, and pushes the answer to the user live over WebSocket — with email/SMS/Telegram notification
planned on top of that. Access is role-based (`admin`/`user`); an admin additionally gets a
user-management panel and read-only Grafana/Kafka-UI views, both proxied through the same Gateway
the frontend already talks to for everything else.

Bootstrapped from a sibling project called `crawlqa` (frontend + observability stack only — the
entire backend was built from scratch in this repo).

## 2. Current status

| Piece | Status |
|---|---|
| Gateway (WS + HTTP proxy + job submission) | **Implemented** |
| Auth Service | **Implemented** |
| Job Manager Service | **Implemented** |
| Scraper | **Implemented** |
| Indexer | **Implemented** |
| Query/Answer Service | **Implemented** |
| Notification Service (email/SMS/Telegram) | **Not implemented** — the only remaining piece |
| Frontend (Expo/React Native) | **Implemented** — auth, job submission, live history, admin panel |
| Observability (Grafana/Loki/Prometheus/Tempo/OTel) | **Implemented** |

A job today goes all the way from submission to a stored, retrievable answer pushed live to the
user. What's missing is *also* emailing/texting/Telegram-ing them about it — the answer already
exists and is visible in-app the moment `answer-ready` lands, notification is a separate, additive
channel on top of that, not a blocker for anything upstream.

## 3. Architecture at a glance

```
                         ┌─────────────────────┐
   Client (frontend) ───▶│      Gateway         │◀── WS (result-saved consumer)
                         │  HTTP + WS, guards    │
                         └──────────┬───────────┘
                     token invalid  │  token valid: publish job-requests
                          ▼         ▼
                  ┌───────────┐   crawl-frontier (Kafka) ◀─────────────────┐
                  │   Auth    │        │                                   │ child URLs
                  │  Service  │        ▼                                   │ (depth-1)
                  │(Postgres) │  ┌─────────────────────┐  page-scraped  ┌──┴─────────────┐
                  └───────────┘  │      Scraper         │────(Kafka)──▶│    Indexer      │
                                  │ (Redis + SeaweedFS)  │               │ (Redis + Qdrant)│
                                  └──────────────────────┘               └────────┬────────┘
                                                                                   │ crawl-complete
                                                                                   ▼
                                  ┌──────────────┐──▶ Qdrant (direct similarity search)
                                  │ Query/Answer │
                                  │   Service    │──▶ LLM (OpenAI-compatible, local LM Studio by default)
                                  └──────┬───────┘
                                         │ answer-ready
                            ┌────────────┴────────────┐
                            ▼                          ▼
                  ┌───────────────────┐      ┌──────────────────────┐
                  │ Notification Svc  │      │ Job Manager Service  │
                  │ email/SMS/Telegram│      │ (Postgres: jobs)     │
                  │  NOT IMPLEMENTED  │      └───────────┬──────────┘
                  └───────────────────┘                  │ result-saved
                                                           ▼
                                                      Gateway (WS push)
```

Every arrow between services is a Kafka message, never a direct call, with two narrow exceptions
that stay plain HTTP (Gateway↔Auth Service, Gateway↔Job Manager Service's read path) — see §7. Full
sequence/flow diagrams: [docs/diagrams/](../diagrams/README.md).

## 4. Services

Seven NestJS services (six implemented, one not), each owning its own slice of the data model
(§5) — other services reach that data only through its API or its Kafka events, never a direct
cross-service table read/write. Full backend layering convention in §9.

### Gateway

- **Owns**: nothing in Postgres — stateless HTTP/WS edge. The *only* thing the frontend ever talks
  to; no other backend service is reachable from outside this deployment's Docker network.
- **Responsibilities**: terminates HTTP + WebSocket; verifies JWTs locally, no network round-trip
  per request (§8); proxies `/auth/*`, `/me`, `/admin/users*` to Auth Service (thin relay, not a
  translation layer — the same request/response bodies Auth Service already validates and returns);
  on `POST /jobs`, validates `{url, query, depth?}` (`depth` optional, integer 1..`MAX_CRAWL_DEPTH`,
  defaulted to the ceiling when omitted — the only server-side enforcement of that cap), publishes a
  `job-requests` Kafka message and responds `202` immediately, no synchronous call to Job Manager
  Service and no `job_id` yet; on `GET /jobs*`, calls Job Manager
  Service's internal HTTP API; maintains a `user_id → WebSocket` connection registry; consumes
  `job-created`/`result-saved`, relaying each to the matching connection as `job.created`/
  `job.completed`; gates and reverse-proxies `/admin/grafana`/`/admin/kafka-ui` for admins only.
- **Talks to**: Auth Service (HTTP), Job Manager Service (HTTP, read path + retry), Kafka (produces
  `job-requests`, consumes `job-created`/`result-saved`), Grafana + Kafka UI (HTTP, admin-gated
  reverse proxy).

### Auth Service

- **Owns**: `users`, `refresh_tokens` (Postgres, via TypeORM).
- **Responsibilities**: registration (salt+pepper+SHA-256 hashing, §8), login, refresh-token
  issuance/rotation/revocation, `/me` read+update, admin user CRUD, first-admin bootstrap
  (`ADMIN_EMAIL`/`ADMIN_PASSWORD` env-based auto-seed on startup — a no-op once any admin exists).
- **Talks to**: Postgres only. No Kafka involvement. Runs on its own port (`8001`) but is
  server-to-server only — nothing outside the Gateway calls it.

### Job Manager Service

Kafka-only, no HTTP surface exposed outside the Docker network (Gateway calls its internal API).
The service that turns a `job-requests` message into a real, trackable job.

- **Owns**: `jobs` — `id` (generated here, the only source of a `job_id`), `user_id`, `url`,
  `query`, `result` (`NULL` until answered), `failed_reason` (`NULL` unless Query/Answer gave up).
- **Responsibilities**: consumes `job-requests` (`depth` included, already resolved/validated by
  the Gateway — not one of the columns above, see `data-model.md`); inserts the `jobs` row; publishes
  the seed `crawl-frontier` message (`depth` carried straight through from job-requests); publishes
  `job-created` so the Gateway can
  relay the real `job_id` over WebSocket; on `answer-ready`, writes `jobs.result` or
  `jobs.failed_reason` and publishes `result-saved`; serves `GET /jobs`/`GET /jobs/:id` for the
  Gateway's read proxy; on `POST /jobs/:id/retry`, clears `failed_reason` and republishes
  `crawl-complete` with a fresh retry budget — no re-crawl, Qdrant's already-indexed chunks are
  reused untouched.
- **Talks to**: Kafka (`job-requests` in; `crawl-frontier` seed + `job-created` out; `answer-ready`
  in; `result-saved` + `crawl-complete`-on-retry out), Postgres (`jobs`), Gateway (inbound HTTP).

### Scraper

Kafka-only microservice, no HTTP surface, no Postgres table of its own. Two internal pieces
(one Nest app — internally complex but one cohesive concern, per §9's single-vs-multi-concern
test):

- **Frontier Consumer** — `@EventPattern('crawl-frontier')`. Owns the per-job dedup gate (`SADD
  crawl:{job_id}:visited`, Redis — this single atomic op *is* the dedup gate, making at-least-once
  Kafka redelivery harmless) and enqueues newly-seen URLs onto the `process-url` BullMQ queue.
- **Scraper Worker(s)** — BullMQ workers on `process-url`. Plain HTTP fetch (30s timeout, no
  headless browser, no JS execution). A transient failure (timeout/connection error/5xx) retries up
  to `SCRAPER_FETCH_MAX_ATTEMPTS` (default 3) with exponential backoff; a permanent failure (any
  4xx) is terminal immediately, no retry. On success (HTML only — other content types hit a
  deliberately unimplemented stub): saves raw HTML to SeaweedFS keyed by
  `sha256(stripFragment(url))`, extracts and filters outbound links (same-domain against the job's
  seed hostname, ignoring a leading `www.`; only if the next hop's depth budget would still be
  positive), re-publishes surviving children onto `crawl-frontier` at `depth - 1`, publishes
  `page-scraped` for the Indexer.
- **Owns**: nothing in Postgres. Shares per-job Redis coordination state with the Indexer (its own
  scoped client copy, not a shared lib — see §5's Redis section).
- **Talks to**: Kafka (`crawl-frontier` in/out, `page-scraped` out — never `crawl-complete`, only
  the Indexer publishes that), Redis, SeaweedFS.
- **Verified live**: a real crawl of `info.cern.ch` produced 24 succeeded pages + 1
  correctly-classified permanent failure (404, no wasted retries) + a real `crawl-complete`
  summary; a separate test against an unreachable host confirmed the transient-failure path
  genuinely retries `SCRAPER_FETCH_MAX_ATTEMPTS` times before giving up. Scaled to 2 instances
  against a 586-page real crawl (`books.toscrape.com`) with per-instance logs summing to the true
  total.

### Indexer

Kafka-only microservice, no HTTP surface, no Postgres table of its own. Mirrors the Scraper's
shape:

- **Index Intake Consumer** — `@EventPattern('page-scraped')`, bridges each message onto the
  `index-page` BullMQ queue. No dedup gate needed — unlike a `crawl-frontier` message, a
  `page-scraped` message is never a rediscovery of an already-seen URL.
- **Indexing Worker(s)** — BullMQ workers on `index-page`. Fetch the raw HTML blob from SeaweedFS,
  strip it to plain text (`cheerio`), chunk it (`RecursiveCharacterTextSplitter`, 1000/200
  size/overlap), embed it (LM Studio's OpenAI-compatible API via `OpenAIEmbeddings`, forcing
  `encodingFormat: 'float'` — see the integration-bug callout below), delete stale vectors for the
  URL, upsert the new chunks into Qdrant. **The only service that ever checks for job completion**:
  once its own decrement observes both Redis pending counters at zero and wins a `SET NX` guard
  (exactly-once even under Kafka redelivery), publishes `crawl-complete` — see §6 for why the
  Scraper deliberately never does this itself.
- **Owns**: nothing in Postgres; is the only writer to the Qdrant collection (not "owned" the way
  a Postgres table is, but exclusively written by this service).
- **Talks to**: Kafka (`page-scraped` in, `crawl-complete` out — the only publisher of that topic),
  Redis (own scoped copy of the coordination client), SeaweedFS (reads), Qdrant (writes), LM Studio
  (embedding calls, `host.docker.internal`, not a compose service name — swappable to any
  OpenAI-compatible server via `EMBEDDING_BASE_URL`, no code change).
- **A real integration bug, found and fixed**: LM Studio's `/v1/embeddings` endpoint silently
  returns a truncated vector (192 values instead of 768) for `encoding_format: "base64"` — the
  `openai` SDK's own default — instead of erroring. Fixed by forcing `encodingFormat: 'float'`,
  commented at its exact call site.
- **Verified live**: a real crawl of `info.cern.ch` produced 24 indexed pages, 64 chunks in Qdrant
  with correct `job_id` scoping and real readable text, a `crawl-complete` fired exactly once with
  the correct seed-URL `url` field, and re-submitting the same seed URL confirmed no stale chunks
  survive a re-index. Originally built against Milvus (a real 3-container etcd+MinIO+standalone
  topology), migrated to Qdrant (single container) once that complexity proved unwarranted for this
  project's scale.

### Query/Answer Service

Kafka-only microservice, no HTTP surface, no Postgres table, no BullMQ/Redis at all (no per-job
fan-in to coordinate, unlike the Scraper/Indexer — `crawl-complete`→`answer-ready` is a strict 1:1
mapping). The RAG step:

- **Crawl Complete Consumer** — `@EventPattern('crawl-complete')`, calls `AnsweringService.handle()`
  directly.
- **AnsweringService** — multi-query, dual-modality retrieval before the answer call (see
  `docs/planning/04-retrieval-quality-plan.md` for the reproduced bug this responds to: a
  single-phrasing, dense-only top-5 search missed the one chunk that literally answered the
  question). (1) An `IQueryExpander` (own scoped LLM client) generates 2 diversified rewrites of the
  job's `query` — one broader paraphrase, one that preserves the original's distinctive words
  verbatim — and the original query itself is always kept as a third variant. (2) All 3 variants are
  embedded in one batched call (own scoped copy of the Indexer's embedding client, same config) and
  searched against Qdrant directly (dense/cosine, `job_id`-scoped) **and**, in parallel, searched via
  in-process Okapi BM25 over the job's chunk set (fetched once via a `job_id`-scoped Qdrant scroll —
  no separate search engine). (3) Reciprocal Rank Fusion combines the 3 dense-ranked lists into one
  and, separately, the 3 lexical-ranked lists into another (rank-based, not raw-score-based, so
  cosine similarity and BM25 scores combine validly) — each modality kept to its own top 5, merged
  and deduped by (`url`, chunk index) into the final context, up to 10 chunks. This two-stage fusion
  (per-modality, then merged) guarantees the final context always has candidates from both
  strategies, rather than risking one dominating every rank. (4) Builds a system+user RAG prompt
  from the fused chunk set (even the zero-chunks case still calls the LLM and says so plainly, no
  hand-rolled canned answer), calls a config-driven OpenAI-compatible LLM client (`LLM_BASE_URL`/
  `LLM_MODEL`/`LLM_API_KEY`, defaults to the same local LM Studio instance, swappable to a hosted
  provider with no code change), publishes `answer-ready` with `answer_text` set.
- **Retry, Kafka-native, not BullMQ**: a transient failure (embedding/Qdrant/LLM call)
  self-republishes `crawl-complete` with `retry_count` incremented, backoff `2s * 2^retry_count`
  capped at 30s. Past `ANSWER_MAX_RETRIES` (default 5), or immediately on a
  `PermanentAnswerError` (e.g. an embedding-dimension mismatch — retrying can never help), it gives
  up and publishes `answer-ready` with `failed_reason` set instead.
- **Partial crawl failures ignored entirely**: `crawl-complete`'s `succeeded_count`/`failed_count`/
  `failed_urls` go unused — a failed URL was never indexed, so it can't affect retrieval either way;
  the answer is generated purely from whatever chunks actually exist in Qdrant for the `job_id`.
- **Owns**: nothing in Postgres.
- **Talks to**: Qdrant (read-only, both similarity search and scroll), an LLM (HTTP, both query
  expansion and the final answer), Kafka (`crawl-complete` in and out, `answer-ready` out).

### Notification Service — not implemented

Should, on `answer-ready`: look up the user's contact info via an internal call to Auth Service and
send email + SMS + Telegram, logging each attempt.

- **Would own**: `notifications_log`.
- **Would talk to**: Auth Service (internal call), external email/SMS/Telegram providers (not
  chosen yet), Kafka (`answer-ready` in), Postgres (`notifications_log`).

### Internal (service-to-service) calls

Plain HTTP via Nest's `HttpModule` for every synchronous call above (Gateway↔Auth, Gateway↔Job
Manager Service, would-be Notification↔Auth) — not NestJS's TCP microservice transport. The Scraper
and Indexer never call each other synchronously at all; they're bridged entirely by Kafka + shared
Redis state. Gateway's own `JwtAuthGuard`/`RolesGuard` (`@app/auth-kernel`) reject an invalid token
or wrong role locally *before* ever calling Auth Service, which then re-verifies independently
(defense in depth). A request crossing this hop produces one connected distributed trace (Gateway's
span → Auth Service's span → its Postgres spans → back), not two disconnected ones.

## 5. Data model

Single Postgres instance for this project's scale; `pgvector` isn't needed since embeddings live in
Qdrant instead. Tables are grouped by **owning service** — even sharing one physical database, only
the owning service writes its own tables directly.

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()
```

### Owned by Auth Service (implemented)

TypeORM, `synchronize: true` outside `NODE_ENV=production` — no migration framework yet.

```sql
CREATE TYPE user_role AS ENUM ('admin', 'user');

CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT NOT NULL UNIQUE,  -- always stored lowercased
  name              TEXT,
  phone_number      TEXT,                 -- E.164 format, required before SMS can be sent
  telegram_chat_id  TEXT,                 -- set once the user links their Telegram account
  password_hash     TEXT NOT NULL,        -- SHA-256(pepper + salt + plaintext) — see §8
  password_salt     TEXT NOT NULL,        -- random per-user, stored plaintext (salt isn't secret)
  role              user_role NOT NULL DEFAULT 'user',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,       -- SHA-256 of the raw token, no salt/pepper needed
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON refresh_tokens (user_id);
```

### Owned by Job Manager Service (implemented)

```sql
CREATE TABLE jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- generated here, the only source of a job_id
  user_id       UUID NOT NULL REFERENCES users(id),
  url           TEXT NOT NULL,
  query         TEXT NOT NULL,
  result        TEXT,          -- NULL until Query/Answer's answer comes back
  failed_reason TEXT           -- NULL unless Query/Answer gave up; cleared by a real answer or a retry
);
CREATE INDEX ON jobs (user_id);
```

Real gaps in this table, worth stating plainly:

- **No max-depth column** — `depth` **is** client-provided and does vary per job (`POST /jobs`'s
  optional `depth`, 1..`MAX_CRAWL_DEPTH`, defaulted to the ceiling when omitted), it's just never
  persisted to this row — nothing downstream needs it after the seed `crawl-frontier` message is
  published. `MAX_CRAWL_DEPTH` itself (currently 10, raised from the original product spec's 3) is
  a fixed constant that lives **only** in the Gateway (`apps/gateway/src/jobs-proxy/application/
  constants.ts`), not the shared `libs/kafka-contracts` — no other backend service can see or
  depend on the ceiling — the ceiling `depth` is validated against, not the value actually used.
- **No status column** — "done" is `result IS NOT NULL OR failed_reason IS NOT NULL`; no
  `crawling`/`answering` in-between state exists anywhere in Postgres.
- **No timestamps, no error tracking** on this table.
- **No source attribution** — which URLs an answer drew from isn't persisted; Query/Answer Service
  produces that list only transiently while building its LLM prompt.

### Owned by the Scraper and the Indexer

Neither owns a Postgres table.

- **Scraper**: writes raw HTML to **SeaweedFS** (self-hosted, S3-compatible), keyed by
  `sha256(stripFragment(url))`. No freshness/TTL logic, no cross-job cache.
- **Indexer**: writes embedded chunks to **Qdrant** (self-hosted, single container). Collection
  schema: vector field dimension **768** (`text-embedding-nomic-embed-text-v1.5` by default,
  `EMBEDDING_MODEL`/`EMBEDDING_DIMENSION` env-configurable), `HNSW` + `COSINE` index (automatic on
  collection creation). Payload fields (filterable/deletable on): `job_id`, `user_id`, `url`,
  `query`, `chunk_index`, `scraped_at`, plus `text` (the chunk's own content — needed to get real
  text back from a similarity search, not just a vector). On re-scrape, stale vectors for a `url`
  are deleted (Qdrant delete-by-filter) before upserting new chunks. Point IDs: a fresh
  `randomUUID()` per chunk on every upsert (Qdrant requires a uint64 or valid UUID; stable IDs
  aren't needed since delete-by-`url` always runs first).

Query/Answer Service reads Qdrant **directly** via its own scoped embedding + read client — no new
Indexer HTTP API — following the same "independent scoped client per service onto shared infra"
precedent as Redis below. The Indexer remains the only writer.

### Owned by Notification Service — not implemented

```sql
CREATE TYPE notification_channel AS ENUM ('email', 'sms', 'telegram');
CREATE TYPE notification_status AS ENUM ('sent', 'failed');

CREATE TABLE notifications_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID NOT NULL,
  user_id       UUID NOT NULL,
  channel       notification_channel NOT NULL,
  status        notification_status NOT NULL,
  error_message TEXT,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON notifications_log (job_id);
CREATE INDEX ON notifications_log (user_id);
```

### Redis

One shared instance (`devops/redis`), used by both the Scraper and the Indexer — never one per
service. Per-job coordination state, plus BullMQ's own internal queue keys. Not a table of record
for either service.

| Key | Type | Purpose |
|---|---|---|
| `crawl:{job_id}:visited` | Set | authoritative per-job dedup gate (Scraper only) |
| `job:{job_id}:pending_scrape` | Int | completion tracking — Scraper writes, Indexer reads |
| `job:{job_id}:pending_index` | Int | completion tracking — Indexer writes and reads |
| `job:{job_id}:succeeded` | Set | URLs the Scraper successfully scraped |
| `job:{job_id}:failed` | Set | URLs that terminally failed to scrape |
| `job:{job_id}:notified` | flag | completion fires exactly once — `SET NX`'d by the Indexer only |

Each side keeps its **own independent copy** of the Redis client code — the Indexer never touches
the dedup gate or the succeeded/failed sets — but the literal key-name strings must stay
byte-identical between them (covered by a contract test on each side). No `job:{job_id}:meta`
hash — `user_id`/`query`/`base_url` all ride on the Kafka message itself, propagated unchanged by
every service that re-publishes it. All job-scoped keys get a ~1 hour cleanup TTL once a job
completes; no indefinite growth, no global cross-job cache.

## 6. Event schemas (Kafka)

All services connect via `@nestjs/microservices`' Kafka transporter (kafkajs underneath). Partition
keys below are chosen for even load distribution, not ordering guarantees — job coordination
correctness is Redis's job (§5), not Kafka ordering.

| Topic | Producers | Consumers | Partition key | Status |
|---|---|---|---|---|
| `job-requests` | Gateway | Job Manager Service | `user_id` | Implemented |
| `crawl-frontier` | Job Manager Service (seed), Scraper (children) | Scraper's Frontier Consumer | `url_hash` | Implemented |
| `job-created` | Job Manager Service | Gateway | `job_id` | Implemented |
| `page-scraped` | Scraper | Indexer's Index Intake Consumer | `url_hash` | Implemented |
| `crawl-complete` | Indexer (original), Query/Answer (auto-retry), Job Manager Service (manual retry) | Query/Answer's Crawl Complete Consumer | `job_id` | Implemented |
| `answer-ready` | Query/Answer Service | Job Manager Service (implemented), Notification Service (not implemented) | `job_id` | Implemented (producer + one of two consumers) |
| `result-saved` | Job Manager Service | Gateway | `user_id` | Implemented |

Payload shapes:

- **`job-requests`**: `{ user_id, url, query, depth }` — `user_id`/`url`/`query` become the `jobs`
  row verbatim, plus a generated `id` and `NULL result`; `depth` (1..`MAX_CRAWL_DEPTH`, resolved and
  validated by the Gateway, defaulted to `MAX_CRAWL_DEPTH` when the client omits it) is not
  persisted — only used as the seed `crawl-frontier` message's starting `depth`.
- **`crawl-frontier`**: `{ job_id, user_id, url, depth, query, base_url }` — `depth` is a
  remaining-hops budget (starts at whatever job-requests carried, counts down, stops re-publishing at 0);
  `query`/`base_url` are propagate-only fields set once by the seed and copied unchanged on every
  child.
- **`job-created`**: `{ job_id, user_id, url, query }` — this is the *only* way the frontend learns
  the real `job_id`, since `POST /jobs` never returns one.
- **`page-scraped`**: `{ job_id, user_id, url, normalizedUrl, blobKey, depth, scrapedAt, query,
  base_url }`.
- **`crawl-complete`**: `{ job_id, user_id, query, url, succeeded_count, failed_count,
  succeeded_urls, failed_urls, retry_count }` — `url` is the base/seed URL. Query/Answer only reads
  `job_id`/`user_id`/`query`; the count/URL fields are ignored (§4).
- **`answer-ready`**: `{ job_id, user_id, answer_text, failed_reason }` — exactly one of
  `answer_text`/`failed_reason` is set, never both.
- **`result-saved`**: `{ job_id, user_id, result, failed_reason }` — same one-or-the-other
  invariant as `answer-ready`. No `completed_at` — the `jobs` table carries no timestamps.

Topic config (starting point, single-broker dev setup, all replication-factor 1):

| Topic | Partitions | Retention |
|---|---|---|
| `job-requests` | 3 | 1 day |
| `crawl-frontier` | 6 | 1 day |
| `job-created` | 3 | 1 day |
| `page-scraped` | 6 | 1 day |
| `crawl-complete` | 3 | 1 day |
| `answer-ready` | 3 | 1 day |
| `result-saved` | 3 | 1 day |

### BullMQ queues (not Kafka — sit inline in the same pipeline)

The Scraper and Indexer each front their Kafka consumer with a BullMQ queue instead of a second
Kafka topic, so retries/failures are BullMQ's `attempts`/`backoff` rather than a hand-rolled Kafka
retry/DLQ topic.

| Queue | Producer | Worker | Backed by |
|---|---|---|---|
| `process-url` | Scraper's Frontier Consumer | Scraper Worker(s) | Redis (BullMQ) |
| `index-page` | Indexer's Index Intake Consumer | Indexing Worker(s) | Redis (BullMQ) |

## 7. API contracts

All HTTP/WS surface is exposed through the **Gateway** only. Auth Service still runs on its own
port (`8001`) but that's server-to-server now, not frontend-facing. CORS is permissively open
(`origin: true`) for this Docker Compose dev phase — lock down before any real deployment.

### Auth (no token required — this is how you get one)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/register` | `{ email, password, name?, phone_number?, telegram_chat_id? }` | `201` → `{ user, access_token, refresh_token }` |
| POST | `/auth/login` | `{ email, password }` | `200` → `{ user, access_token, refresh_token }` |
| POST | `/auth/refresh` | `{ refresh_token }` | `200` → `{ access_token, refresh_token }` (rotated) |
| POST | `/auth/logout` | `{ refresh_token }` | `204` — revokes the refresh token |

`email` always lowercased server-side (case-insensitive uniqueness, `409` on duplicate). `password`
must be at least 8 characters (`400` otherwise). `user` shape: `{ id, email, name, role,
phone_number, telegram_chat_id }` — never includes hash/salt.

### Self-service (valid access token, any role)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/me` | — | `200` → `user` |
| PATCH | `/me` | `{ email?, name?, phone_number?, telegram_chat_id?, password? }` | `200` → `user` |

### Jobs (valid access token)

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/jobs` | `{ url, query, depth? }` | `202` → `{ status: "accepted" }` — **no `job_id`** (see `job.created` WS event below). `url` max 2048 chars; `query` max 500 chars, restricted to English/Hebrew letters, digits, and basic punctuation; `depth` optional, integer 1..`MAX_CRAWL_DEPTH` (currently 10) when given, defaulted to `MAX_CRAWL_DEPTH` when omitted (`400` on any violation) — the query charset is an allowlist chosen specifically to stop Unicode-smuggling prompt injection (invisible Unicode Tag characters riding on an emoji, zero-width/bidi tricks) from ever reaching the RAG prompt. Enforced by `CreateJobRequestDto` on the Gateway; mirrored in the frontend for as-you-type feedback only. |
| GET | `/jobs` | — | User: own jobs only. Admin: all jobs, optional `?user_id=` filter. |
| GET | `/jobs/:id` | — | User: `403` if not their own job. Admin: any job. `result` is `null` until answered. |
| POST | `/jobs/:id/retry` | — | User: `403` if not theirs. `202` on success — clears `failed_reason`, republishes `crawl-complete` with a fresh retry budget, no re-crawl. `404` if the job doesn't exist, `409` if it has no `failed_reason` to retry. |

`job` shape: `{ id, user_id, url, query, result, failed_reason }` — no `status`/timestamps; both
`result`/`failed_reason` are plain string-or-null fields directly on the object.

### Admin — user management (access token with `role: admin`)

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/admin/users` | — | List all users |
| GET | `/admin/users/:id` | — | `404` if not found |
| PATCH | `/admin/users/:id` | `{ email?, phone_number?, role? }` | Role change takes effect on that user's *next* login (JWT already carries the old role until it expires) |
| DELETE | `/admin/users/:id` | — | `204`, `404` if not found |

Admin also gets two gated reverse-proxied tool UIs, neither a JSON API: `GET /admin/grafana*` and
`GET /admin/kafka-ui*` — full-screen embedded dashboards (Grafana/Kafka UI respectively), gated by
a query-param-token-upgrading-to-httpOnly-cookie scheme
([docs/diagrams/admin-proxy-sequence.md](../diagrams/admin-proxy-sequence.md) has the sequence).
Grafana additionally verifies a second, Grafana-scoped JWT the Gateway mints fresh on every
proxied request (its own RS256 keypair, org role always `Admin`) — real per-admin auth rather than
anonymous Viewer access, see
[docs/planning/05-grafana-jwt-auth.md](../planning/05-grafana-jwt-auth.md). Kafka UI has no
equivalent; it's reachable through the same gate with no further identity check on its own side.

### WebSocket (Socket.IO)

Chosen over raw `ws` for auto-reconnect-with-backoff and rejecting an unauthenticated handshake
outright. Connect to the Gateway's HTTP origin, path `/ws`, `transports: ['websocket']`. Token sent
as `auth: { token }` in the handshake, not a query param or header. Invalid/missing token →
`connect_error`, never `connect`.

Every server→client event arrives on a single `message` event:

```jsonc
// the ONLY way the frontend learns job_id — POST /jobs never returns one
{ "type": "job.created", "job_id": "uuid", "user_id": "uuid", "url": "string", "query": "string" }

// on completion — exactly one of result/failed_reason is set
{ "type": "job.completed", "job_id": "uuid", "result": "string | null", "failed_reason": "string | null" }
```

No `job.status` progress event — the `jobs` table has no status column, so there's no in-between
state to report. No client→server messages — push-only. If a client isn't connected when an event
fires, no action is taken; a subsequent `GET /jobs` will show the current state, just without the
live push.

### Token handling (Gateway behavior)

For every request other than `/auth/*`, the Gateway verifies the `Authorization: Bearer <token>` JWT
signature and expiry **locally** — no network call to Auth Service per request. Only a missing/
malformed/expired token routes the client to `/auth/refresh` (or `/auth/login` again).

## 8. Auth

### Roles

`admin` and `user` (Postgres enum `user_role`). No further granularity.

|  | Own profile/jobs | All users | All jobs |
|---|---|---|---|
| **user** | read + update | — | — |
| **admin** | read + update | list/view/update/delete | read all |

### Registration

`email` + `password` required (≥8 chars); `name`/`phone_number`/`telegram_chat_id` optional
(SMS/Telegram notifications simply won't fire for a user missing the relevant field). All new
registrations get `role: 'user'` — no public path to create an admin. First-admin bootstrap is
env-based (`ADMIN_EMAIL`/`ADMIN_PASSWORD`, `AdminSeedService`, safe to leave set permanently — a
no-op once any admin exists). Telegram account-linking flow (deep-link vs. manual code) is not yet
decided.

### Password hashing

Salt + pepper + SHA-256 (not bcrypt/argon2/scrypt — no built-in work factor, comparatively fast to
brute-force even salted, kept as specified anyway):

```
password_hash = SHA256(PEPPER + password_salt + plaintext_password)
```

`password_salt` is random per-user, stored plaintext (not secret — its only job is defeating
precomputed rainbow tables). `PEPPER` is a single server-side secret, never stored in the database,
identical for every user; losing it (e.g. a source leak) removes its protection, losing the DB
alone does not reveal it. Concatenation order (`PEPPER + salt + password`) must stay identical
between registration and login.

### Tokens

- **Access token**: JWT, **15 min** TTL, payload `{ sub: user_id, role, exp }`, signed with
  `JWT_SECRET`. Verified locally by the Gateway, no DB/network round-trip per request.
- **Refresh token**: opaque random string (`crypto.randomBytes(32).toString('hex')`), **30 day**
  TTL. Server stores only its SHA-256 hash. Rotated on every use (`POST /auth/refresh` revokes the
  old row, issues a new pair) — a stolen-and-replayed refresh token only works once.
- **Logout**: marks the given refresh token's `revoked_at`. Already-issued access tokens remain
  valid until natural expiry — no server-side access-token revocation list.
- **Role changes take effect on next login**, not retroactively — role lives inside the JWT.

## 9. Backend architecture — clean/hexagonal layering

Every NestJS service follows the same internal 3-layer structure, dependency rule strictly
one-directional: **API → Application → Infrastructure**, and at every boundary the caller depends
on an **interface**, never a concrete class.

- **API layer** — HTTP controllers, middlewares, Kafka consumers (`@EventPattern`/
  `@MessagePattern` — inbound only), WebSocket gateways, BullMQ workers' `process` functions. No
  business logic — validates/deserializes input, calls exactly one Application-layer service
  through its interface, serializes the result back out.
- **Application layer** — the actual use-case logic. Each use case implements an interface of its
  own (so the API layer depends on that interface). Depends only on interfaces the Infrastructure
  layer implements — a repository, a password hasher, an embeddings client, an LLM client, an
  event publisher. Never imports `pg`, `kafkajs`, a specific ORM, or any concrete Infrastructure
  class directly.
- **Infrastructure layer** — concrete implementations: Postgres repositories, the
  salt+pepper+SHA-256 hasher, **Kafka producers** (an outbound side effect, same as calling
  Postgres — never call `kafkaClient.emit(...)` directly from Application/API code), the LangChain
  embedding client, BullMQ **enqueue** calls (`queue.add(...)`, same reasoning — a BullMQ *worker*
  is API-layer, inbound; *enqueuing* is Infrastructure, outbound).

**Domain models** (`User`, `RefreshToken`, ...) live in a top-level `models/` folder, sibling to
`api/`/`application/`/`infrastructure/` — no framework imports, ever, and every layer is free to
import from it. Not the same thing as an `I<Thing>` interface some class `implements` — those live
in whichever layer's `interfaces/` subfolder the implementing class lives in
(`application/interfaces/` for interfaces Application classes implement, consumed by API;
`infrastructure/interfaces/` for interfaces Infrastructure classes implement, consumed by
Application).

### Single-concern vs. multi-concern apps

**Default — flat.** One `models/`/`api/`/`application/`/`infrastructure/` at the app's `src/` root.
Auth Service, the Scraper, and the Indexer are all single-concern this way (internally complex, but
each is still one cohesive concern end to end) despite each having two internal pieces (consumer +
worker).

**Exception — Gateway**, a genuine multi-concern app: `realtime/` (WS registry + the
`job-created`/`result-saved` consumers), `auth-proxy/` (HTTP relay to Auth Service), `jobs-proxy/`
(`POST`/`GET /jobs*`), `tool-proxy/` (admin-gated Grafana/Kafka-UI reverse proxy) — each with its
own `api/`/`application/`/`infrastructure/`, the app's top-level module only importing each
concern's own module. DI tokens for a multi-concern app stay in one `tokens.ts` at the app root,
grouped by concern.

### NestJS wiring convention

Every interface bound to its implementation via an injection token, in every layer:

```ts
export const AUTH_SERVICE = Symbol('IAuthService');
export const USER_REPOSITORY = Symbol('IUserRepository');
export const PASSWORD_HASHER = Symbol('IPasswordHasher');

@Module({
  providers: [
    { provide: AUTH_SERVICE, useClass: AuthService },
    { provide: USER_REPOSITORY, useClass: PostgresUserRepository },
    { provide: PASSWORD_HASHER, useClass: SaltPepperSha256Hasher },
  ],
})
export class AuthModule {}
```

### DTOs

`backend/libs/dtos` (`@app/dtos`) holds shapes **more than one service's code needs to agree on**
(Auth Service's request DTOs, since the Gateway relays the same bodies it validates/returns). A DTO
stays local to `apps/<service>/src/.../api/dto/` when no other service will ever reference the same
shape. Kafka event payloads are a separate concern, covered by `backend/libs/kafka-contracts`, not
duplicated as DTOs.

## 10. Frontend

Expo Router (file-based routing, `(tabs)` group), Redux Toolkit for state, Gluestack UI for
theming. Strict services-layer convention: all I/O (HTTP, WebSocket) lives in `src/services/`,
called only from thunks in `src/store/slices/`, never inline in a thunk or a component. WebSocket
via Socket.IO, auto-connected whenever `authSlice.accessToken` changes. The frontend only ever talks
to the Gateway — never Auth Service or any other backend service directly, even though Auth Service
technically still listens on its own port. Full breakdown (theming pipeline, provider order,
per-file structure): `frontend/CLAUDE.md`.

Admin-only screens (`app/(tabs)/admin/`) gate on the decoded JWT's role claim, not just on hiding a
tab — a hidden tab is not access control, the backend enforces the real boundary. Grafana/Kafka UI
are shown full-screen inside a `WebView`, not an embedded iframe pane, navigating to the Gateway's
`/admin/grafana`/`/admin/kafka-ui` proxy routes (§4, §7).

## 11. Observability

`devops/observability/`: every backend service → OTLP/gRPC → Collector → fans out to Loki (logs),
Prometheus (metrics), Tempo (traces), all viewable in Grafana (reached only via the Gateway's
`/admin/grafana` proxy — no direct host port). Gateway/Auth Service get a per-request log line via
shared middleware; the Kafka-only services (Job Manager, Scraper, Indexer, Query/Answer) have no
HTTP surface, so their per-message activity shows up as Kafka spans instead
(`@opentelemetry/instrumentation-kafkajs`), alongside real `aws-sdk` spans (SeaweedFS blob writes)
and outbound `tcp.connect` spans for page fetches. A real request/message produces a root-span trace
in Tempo with real child spans, a Loki log line correlated by `trace_id`, and per-route-or-topic
metrics in Prometheus.

Two things worth knowing: (1) if the Collector isn't reachable at boot, telemetry export just fails
silently by default (logged via `diag`, no retry buffer — an outage means real data loss for its
duration, not just delay); (2) apps build with plain `tsc`+`tsc-alias`, not webpack, because OTel's
auto-instrumentation patches `require()` at runtime, which bundling would break.

## 12. Deployment (Docker Compose)

`devops/docker-compose.yml` pulls in one `devops/<unit>/docker-compose.yml` per service via
`include:` (Compose Specification, stable since v2.20). **Observability must come up first** — the
app stack's network references it as `external: true`.

Twelve services + one one-off job: `postgres`, `redis`, `seaweedfs`, `qdrant`, `gateway` (`:8000`),
`auth` (`:8001`), `job-manager`, `scraper`, `indexer`, `query-answer`, `frontend` (`:8081`), `kafka`
(broker + `kafka-init` topic-creation one-off + `kafka-ui`). Every backend dependency address
(`KAFKA_BROKERS`, `REDIS_URL`, `SEAWEEDFS_ENDPOINT`, `VECTOR_DB_URL`, `JOB_MANAGER_URL`,
`AUTH_SERVICE_URL`, `GRAFANA_URL`, `KAFKA_UI_URL`, `EMBEDDING_BASE_URL`, `LLM_BASE_URL`) is required
config with no code fallback — each service throws `"X is not configured"` at boot rather than
silently defaulting to a hardcoded `localhost`/container-name. LM Studio is the one dependency
nothing in `docker compose up` starts — it must be running locally, reachable at
`host.docker.internal:1234`, with an embedding model and a chat-capable model both loaded.

`devops/.env`'s `PUBLIC_ORIGIN` is the single source of truth for the deployment's public origin,
read by Grafana's `GF_SERVER_ROOT_URL` and the frontend build.

## 13. Still open (tracked, not blocking)

- Email/SMS provider choice (SMTP vs. SendGrid/etc., Twilio vs. alternatives) — Notification
  Service itself isn't built yet either.
- Telegram account-linking flow (bot deep-link vs. manual linking code).
- CORS is permissively open (`origin: true`) on the Gateway — needs locking down to specific
  origins before any real deployment.
- Whether refresh tokens (or an access-token revocation list) should move to Redis for faster
  lookups — not decided.
- Per-domain rate limiting for the Scraper — not implemented.
- `handleUnsupportedContentType` (non-HTML scrape responses) is a deliberate stub — real behavior
  not decided.
- Source attribution ("this answer drew from these pages") isn't persisted anywhere — would need a
  new `jobs` column or table if ever wanted.
- IaC tool and CI/CD pipeline for a real (non-Compose) deployment — AWS is a documented future
  phase, not a current target.

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

**Status**: Gateway, Auth Service, Job Manager Service, the Scraper, the Indexer, and Query/Answer
Service are implemented — a job can be submitted, crawled, indexed into Qdrant, and answered end to
end. Only Notification Service is left unbuilt — a job's `result` gets written and pushed over
WebSocket, but nothing emails/texts/Telegrams the user about it yet.

## Gateway

- **Owns**: nothing in Postgres — stateless HTTP/WS edge.
- **Responsibilities**: terminate HTTP + WebSocket connections; verify JWT locally (see `auth.md`);
  proxy `/auth/*` to Auth Service; on `POST /jobs`, validate `{url, query, depth?}` via
  `CreateJobRequestDto` (`depth` optional, 1..`MAX_CRAWL_DEPTH`, defaulted to the ceiling when
  omitted — the only server-side enforcement of that cap, since no other service is reachable from
  outside the Gateway), publish a `job-requests` message and respond `202` immediately — no
  synchronous call to Job Manager Service, no `job_id` yet (see `api-contracts.md`); on
  `GET /jobs*`, call Job Manager Service internally; on
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
  still within the message's own remaining-hops `depth` — the Scraper only decrements and checks
  that field, it has no notion of `MAX_CRAWL_DEPTH` itself, see `data-model.md`), re-publish
  children onto `crawl-frontier`, publish `page-scraped` for the Indexer.
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

**Implemented** (`backend/apps/query-answer`). One Nest app, one consumer, no BullMQ/Redis — unlike
the Scraper/Indexer, there's no per-job fan-in to coordinate here:

- **Crawl Complete Consumer** — consumes `crawl-complete` and calls `AnsweringService.handle()`
  directly (a trivial passthrough, same shape as the Indexer's Index Intake Consumer minus the
  BullMQ bridge — `crawl-complete`→`answer-ready` is a strict 1:1 mapping, so there's no queue to
  bridge onto).
- **AnsweringService** — orchestrates multi-query, dual-modality retrieval before ever calling the
  answering LLM (added after a reproduced bug: a single-phrasing, dense-only top-5 search missed
  the one chunk that literally answered the question, because it scored a few ranks below several
  topically-similar-but-wrong chunks — see `docs/planning/04-retrieval-quality-plan.md` for the
  incident and the full design rationale). The pipeline:
  1. **Query expansion** — `IQueryExpander` (own scoped LangChain `ChatOpenAI` client, same
     `LLM_BASE_URL`/`LLM_MODEL` config as the answering LLM below, independently swappable) asks
     the LLM for exactly `QUERY_EXPANSION_COUNT` (2) rewrites of the job's `query`: one broader
     paraphrase in different vocabulary, one that keeps the original's distinctive/unusual words
     verbatim but restructures the sentence. The **original query is always kept** as a third
     variant — never replaced — so a rewrite that drifts off-topic can't crowd it out. On any
     failure (LLM unreachable, unparseable output), falls back to the original query alone; this
     step degrades gracefully, it never fails the job.
  2. **Retrieval, both modalities, every variant** — all 3 query variants are embedded in one
     batched call (own scoped copy of the Indexer's `OpenAiEmbeddingClient` — same
     `EMBEDDING_BASE_URL`/`EMBEDDING_MODEL`/`EMBEDDING_DIMENSION` config, since query and document
     vectors must share one embedding space) and searched against Qdrant directly
     (`IVectorRetriever`, dense/cosine similarity, `job_id`-scoped) — **and**, in parallel, all 3
     variants are searched via `ILexicalRetriever` (in-process Okapi BM25 keyword/term-overlap
     scoring over the job's chunk set, fetched once via a `job_id`-scoped Qdrant scroll — no
     separate search engine needed at this project's per-job scale). Each modality×variant search
     returns up to `RETRIEVAL_TOP_K` (15) candidates.
  3. **Fusion** — Reciprocal Rank Fusion (`reciprocalRankFusion()`, pure/I/O-free, `models/`)
     combines the 3 dense-search ranked lists into one, and separately combines the 3 lexical-search
     ranked lists into another, each kept to its own top `FUSION_TOP_K_PER_MODALITY` (5). This is
     two-stage (fuse within each modality first, then merge the two top-5s, then dedupe overlaps by
     `url`+chunk index) rather than one flat RRF pass over all 6 lists — a flat pass risks one
     modality's votes dominating every rank across every variant (e.g. if all 3 rewrites still share
     literal keywords, BM25 could sweep every slot); the two-stage version guarantees the final
     context always has candidates from both retrieval strategies. RRF fuses purely by each
     candidate's *rank* per list, never its raw score, which is what makes it valid to combine dense
     cosine-similarity scores and BM25 term-overlap scores without normalizing them onto a shared
     scale first.
  4. **Answer** — builds the system+user RAG prompt from the fused, deduped chunk set (up to 10,
     usually fewer once both modalities' picks overlap), including the zero-chunks case (the LLM is
     still called and told plainly that no crawled content was found, rather than a hand-rolled
     canned answer), calls the answering LLM, and publishes `answer-ready` with `answer_text` set.
  On a transient failure anywhere in this pipeline (embedding/Qdrant/LLM calls), retries by
  republishing `crawl-complete` with `retry_count` incremented and a short backoff (`2s *
  2^retry_count`, capped at 30s) — a Kafka-native retry loop, not BullMQ's attempts/backoff. Once
  `retry_count` exceeds `ANSWER_MAX_RETRIES` (default 5), or immediately on a `PermanentAnswerError`
  (e.g. an embedding dimension mismatch — retrying can never help), it gives up and publishes
  `answer-ready` with `failed_reason` set instead. See `event-schemas.md`'s `crawl-complete`/
  `answer-ready` sections for the exact wire shapes.
- **Owns**: nothing in Postgres.
- **Talks to**: Qdrant (read-only, both similarity search and scroll — direct, see below), an LLM
  (OpenAI-compatible HTTP API, both for query expansion and for the final answer — see below), Kafka
  (`crawl-complete` in and out — see above, `answer-ready` out).

**Retrieval — resolved**: Query/Answer reads Qdrant **directly**, via its own scoped embedding +
Qdrant-read clients (`IVectorRetriever` for similarity search, `ILexicalRetriever` for the BM25
scroll-and-score path), rather than through a new Indexer HTTP endpoint. This follows the project's
existing precedent for shared infra — Redis is already accessed via independent scoped client
copies per service (see `data-model.md`'s Redis section) rather than through one owning service's
API — and keeps the Indexer's "Kafka-only, no HTTP surface" trait intact; the Indexer still owns
*writing* to Qdrant (delete-by-`url` + upsert), but reading it is no longer exclusive to it.

**LLM provider — resolved**: one config-driven OpenAI-compatible client (`LLM_BASE_URL` + optional
`LLM_API_KEY` + `LLM_MODEL`), the same swappability pattern `EMBEDDING_BASE_URL` already gives the
Indexer's embedding provider. Defaults to the same local LM Studio instance (a chat-capable model
loaded alongside the embedding model); pointing it at a real hosted OpenAI-compatible provider
(OpenAI, OpenRouter, Groq, ...) instead is a config change, not a code change.

**Partial failures — resolved**: ignored entirely. `crawl-complete`'s `succeeded_count`/
`failed_count`/`failed_urls` go unused by this service — failed URLs were never indexed in the first
place, so they can't affect retrieval either way; the answer is generated purely from whatever
chunks actually exist in Qdrant for the `job_id`.

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
  answered), `failed_reason` (`NULL` unless Query/Answer gave up).
- **Responsibilities**: consumes `job-requests` (`{user_id, url, query, depth}`); generates a
  `job_id` and inserts the `jobs` row with `user_id`/`url`/`query` plus the new `id` and `NULL`
  `result`/`failed_reason` — `depth` is not one of the columns (see `data-model.md`); publishes the
  seed `crawl-frontier` message (`{job_id, user_id, url, depth, query}`, `depth` carried straight
  through from job-requests, already resolved/validated by the Gateway); publishes `job-created` so
  Gateway can relay the new `job_id` to the submitting user over WebSocket. On `answer-ready`, writes `jobs.result` (clearing `failed_reason`) or `jobs.failed_reason`
  depending on which the message carries, then publishes `result-saved` with the matching shape. On
  `GET /jobs`, returns user-scoped or admin-filtered jobs. On `POST /jobs/:id/retry`, verifies
  ownership, rejects if the job has no `failed_reason` to retry, clears it, and republishes
  `crawl-complete` with `retry_count: 0` — no re-crawl, the Indexer's chunks are still in Qdrant.
- **Talks to**: Kafka (`job-requests` in, `crawl-frontier` seed + `job-created` out, `answer-ready`
  in, `result-saved` out, `crawl-complete` out for manual retries), Postgres (`jobs`), Gateway
  (internal HTTP call, inbound — read path plus `POST /jobs/:id/retry`).


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

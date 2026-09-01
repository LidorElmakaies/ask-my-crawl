# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

askmycrawl crawls a URL, answers a question about that page's content using AI, and notifies the
user by email, SMS, and Telegram when the result is ready, with a live-updating UI. Role-based
(`admin`/`user`) — see `docs/specs/` for the full architecture and `docs/planning/` for the
reasoning behind it. It was bootstrapped from a sibling project called `crawlqa` (frontend +
observability stack only — the backend below was built from scratch in this repo).

**Start here for anything non-trivial**: [docs/specs/README.md](docs/specs/README.md) indexes the
full spec set (data model, event schemas, API contracts, service responsibilities, auth, backend
architecture). [docs/planning/01-architecture-notes.md](docs/planning/01-architecture-notes.md) has
the *why* behind decisions the specs don't explain on their own. Four agent personas exist for
working this repo with agentic teams: `.claude/agents/{backend,frontend,devops,testing}.md`.

## Repo layout

```
backend/                 NestJS monorepo — apps/ (gateway, auth, job-manager, scraper, indexer,
                          query-answer; one more service planned, see docs/specs/services.md) +
                          libs/ (auth-kernel, dtos, kafka-contracts, kafka-client, otel — shared
                          code between apps)
frontend/                 Expo / React Native app — see frontend/CLAUDE.md for details
devops/                   docker-compose.yml (app stack) + observability/ (Grafana/Loki/
                          Prometheus/Tempo/OTel — joined to the app stack via a shared Docker
                          network; gateway/auth/job-manager/scraper/indexer/query-answer send real
                          traces/logs/metrics here, see backend/libs/otel)
docs/specs/               Formal specs — source of truth for how the system is supposed to work
docs/planning/            Raw decision log — why things are the way they are
```

## What's actually implemented right now

- **Gateway** (`backend/apps/gateway`) — Socket.IO realtime layer (authenticates the WS handshake
  via `@app/auth-kernel`, pushes events to connected users) **plus** an HTTP proxy layer
  (`src/auth-proxy/`) that fronts every Auth Service route: `/auth/*` (no guard — that's how you
  get a token), `/me` (`JwtAuthGuard`), `/admin/users*` (`JwtAuthGuard` + `RolesGuard('admin')`).
  Gateway checks the token/role locally first (fast-fail, no network call for an obviously bad
  request), then forwards to Auth Service and relays its response verbatim — a thin pass-through,
  not a translation layer, per `docs/specs/services.md`. **Plus** a third concern, `src/jobs-proxy/`
  (`JwtAuthGuard`): `POST /jobs` publishes a `job-requests` Kafka message directly (no synchronous
  call to Job Manager Service, no `job_id` in the `202` response) and `GET /jobs*` forwards to Job
  Manager Service's internal HTTP API. `src/realtime/` also runs the `job-created`/`result-saved`
  Kafka consumers that relay each event onto the matching user's WebSocket connection as
  `job.created`/`job.completed`.
- **Auth Service** (`backend/apps/auth`) — register/login/refresh/logout, `/me`, `/admin/users*`.
  Full clean-architecture implementation, Postgres via TypeORM. Still runs on its own port
  (`8001`), but only the Gateway calls it now — **the frontend never talks to any backend service
  directly, only the Gateway** (a hard project rule, not just current wiring; see the `devops`
  agent). A request crossing the Gateway→Auth Service hop produces one connected distributed trace,
  not two disconnected ones (`backend/libs/otel`).
- **Job Manager Service** (`backend/apps/job-manager`) — Kafka-only microservice (no HTTP surface),
  consumes `job-requests`/`answer-ready`, produces the `crawl-frontier` seed/`job-created`/
  `result-saved`, owns the `jobs` table. Runs on the shared `askmycrawl` Postgres database (same
  physical instance Auth Service uses — see `docs/specs/data-model.md`).
- **Scraper** (`backend/apps/scraper`) — Kafka-only microservice (no HTTP surface, no Postgres
  table of its own), full design in `docs/planning/03-crawler-scraper-indexing-plan.md`. Two
  internal pieces: **Frontier Consumer** (`@EventPattern('crawl-frontier')`, the per-job dedup gate
  via Redis `SADD`, enqueues onto BullMQ's `process-url` queue) and **Scraper Worker(s)** (BullMQ
  workers — plain HTTP fetch, 30s timeout, save raw HTML to SeaweedFS keyed by
  `sha256(fragment-stripped url)`, extract+filter same-domain links, re-publish `crawl-frontier`
  children + `page-scraped`, and — whichever component observes both Redis pending counters at
  zero and wins a `SET NX` race guard — publish `crawl-complete`). Verified end-to-end against the
  live stack: a real crawl of `info.cern.ch` correctly produced 24 succeeded pages (real blobs in
  SeaweedFS, real `page-scraped` messages) + 1 correctly-classified permanent failure (404, no
  wasted retries) + a real `crawl-complete` summary; a separate test against an unreachable host
  confirmed the transient-failure path genuinely retries `SCRAPER_FETCH_MAX_ATTEMPTS` times before
  giving up. Only HTML content is handled — a non-HTML response hits a deliberately unimplemented
  stub (`handleUnsupportedContentType`), not silently ignored. `ProcessUrlService.finalizeUrl()`
  logs a per-URL outcome line (`Scraping succeeded/failed for job_id=... url=...`) — added after
  scaling to 2 Scraper instances against a real `books.toscrape.com` crawl (586 pages) showed the
  Indexer's equivalent per-page log split cleanly across its 2 instances in Loki
  (`service_instance_id` label) while the Scraper had no such visibility; re-running the same crawl
  confirmed the new line splits 290/296 across both instances, summing to the true total.
- **Indexer** (`backend/apps/indexer`) — Kafka-only microservice (no HTTP surface, no Postgres
  table of its own), the other half of `docs/planning/03-crawler-scraper-indexing-plan.md`. Two
  internal pieces: **Index Intake Consumer** (`@EventPattern('page-scraped')`, bridges each message
  onto BullMQ's `index-page` queue, no dedup gate needed) and **Indexing Worker(s)** (BullMQ
  workers — fetch the raw blob from SeaweedFS, strip HTML to text via `cheerio`, chunk via
  `RecursiveCharacterTextSplitter`, embed via LM Studio's OpenAI-compatible API, delete stale
  vectors and upsert the new ones into Qdrant, and — as the only service that ever does — publish
  `crawl-complete`, once it observes the job's pending counters both reach zero). Own scoped copy of
  the Redis coordination logic and the SeaweedFS reader (see `docs/specs/data-model.md` for why
  these stay per-service, unlike the Kafka producer — see `backend/libs/kafka-client` below).
  Verified end-to-end against the live stack: a real crawl of `info.cern.ch` produced 24 indexed
  pages, 64 chunks in Qdrant with correct `job_id` scoping and real readable text, a real
  `crawl-complete` fired exactly once with the correct seed-URL `url` field, and re-submitting the
  same seed URL confirmed no stale chunks survive a re-index. Originally built against Milvus (a
  real 3-container etcd+MinIO+standalone topology), migrated to Qdrant (a single container, no
  external metadata/object-storage dependency) once that complexity proved unwarranted for this
  project's scale — see `docs/planning/03-crawler-scraper-indexing-plan.md` §7. A real integration
  bug found and fixed along the way (commented at its exact call site, see
  `docs/specs/services.md`'s Indexer section): LM Studio's default embedding request encoding
  (`base64`) silently truncates the vector, fixed by forcing `encodingFormat: 'float'`.
- **Query/Answer Service** (`backend/apps/query-answer`) — Kafka-only microservice (no HTTP surface,
  no Postgres table of its own), the RAG step. Two internal pieces, mirroring the Scraper's/
  Indexer's shape: **Answer Intake Consumer** (`@EventPattern('crawl-complete')`, bridges each
  message onto BullMQ's `answer-job` queue — no coordination-store involvement at all, unlike
  `page-scraped`→`index-page`, since `crawl-complete`→`answer-ready` is a strict 1:1 mapping with no
  per-job fan-in to track) and **Answering Worker(s)** (BullMQ workers — embed the job's `query` via
  its own scoped copy of the Indexer's LM Studio embedding client, search **Qdrant directly** for the
  top-k chunks filtered by `job_id` (own scoped read client, not a new Indexer API — see
  `docs/specs/data-model.md`'s Redis-precedent reasoning), build a system+user RAG prompt, call an
  LLM via a config-driven OpenAI-compatible client (`LLM_BASE_URL`/`LLM_MODEL`/`LLM_API_KEY`,
  defaulting to the same local LM Studio instance, swappable to a hosted provider with no code
  change — same pattern as `EMBEDDING_BASE_URL`), and publish `answer-ready`). A partial-failure
  crawl (`crawl-complete`'s `succeeded_count`/`failed_count`/`failed_urls`) is deliberately ignored —
  the answer comes purely from whatever chunks exist in Qdrant for the job. BullMQ here is
  retry/backoff only, not dedup/completion tracking.
- **Not implemented**: Notification Service. `backend/libs/kafka-contracts` (topic names + typed
  Kafka payloads matching `docs/specs/event-schemas.md`) is imported by every producer/consumer
  above; every topic in `event-schemas.md` now has both a producer and a consumer except
  `answer-ready`'s Notification Service side.

## Commands

Backend (run from `backend/`) — see `docs/specs/backend-architecture.md` for the layering, or just
the `backend` agent for a condensed version:
```bash
npm install
npx nest start gateway --watch     # or: auth
npm test                            # unit tests, all apps/libs
npm run test:e2e:gateway            # e2e — real Socket.IO handshake, no external deps
npm run test:e2e:auth               # e2e — real Postgres via testcontainers (needs Docker)
npm run lint
```

Frontend (run from `frontend/`):
```bash
npm install
npx expo start          # Expo Go / dev client
npx expo start --web
```

**Easiest way to run the whole backend + web frontend together**: Docker Compose. **Observability
must come up first** — `devops/docker-compose.yml` references `devops/observability`'s Docker
network as `external: true`, so the whole `devops/` compose project (`gateway`/`auth`/`job-manager`/
`scraper`/`indexer`/`query-answer`/everything) fails to start without it already existing:
```bash
cd devops/observability && docker compose --env-file ../.env up -d   # Grafana (via Gateway's /admin/grafana, no direct port), Loki, Prometheus, Tempo, OTel Collector
cd .. && docker compose up -d --build                                # postgres, redis, seaweedfs, qdrant, gateway (:8000), auth (:8001), job-manager, scraper, indexer, query-answer, frontend (:8081), kafka (:9092)
```
`devops/.env` (copy from `devops/.env.example`) holds `PUBLIC_ORIGIN` — the single source of truth
for the deployment's public origin, read by Grafana's `GF_SERVER_ROOT_URL` and the frontend build.
`devops/observability` is a separate Compose project from `devops/` (different directory), so its
command needs the explicit `--env-file ../.env` flag to share that same file; `devops/`'s own
command picks it up automatically since Compose reads `.env` from the directory it's invoked from.
`kafka` brings up a single-broker KRaft (no Zookeeper) instance plus a one-off `kafka-init` service
that creates all seven topics `event-schemas.md` defines (`job-requests`/`crawl-frontier`/
`job-created`/`answer-ready`/`result-saved` for Job Manager Service, `crawl-complete`/`page-scraped`
for the Scraper/Indexer — matching its partition/retention table exactly), then exits — see the
`devops` agent for image/version and listener layout. `redis` (one shared instance, backs the
Scraper's, the Indexer's, and Query/Answer Service's BullMQ queues + the Scraper/Indexer's per-job
coordination state — Query/Answer needs no coordination state of its own, see `docs/specs/
services.md`) and `seaweedfs` (S3-compatible raw-HTML store, `seaweedfs-init` creates the
`askmycrawl-raw-html` bucket explicitly, read only by the Scraper/Indexer — Query/Answer never
touches it) exist too. `qdrant` (self-hosted vector DB, a single container — see the `devops` agent)
is written to only by the Indexer and read directly by Query/Answer Service (no API in between, see
`docs/specs/data-model.md`); both need a **locally-running LM Studio instance** reachable at
`host.docker.internal:1234` for their embedding calls to succeed (Query/Answer additionally needs a
chat-capable model loaded there for its LLM calls, configurable via `LLM_BASE_URL`/`LLM_MODEL`) — LM
Studio itself isn't containerized, nothing in `docker compose up` starts it. `devops/` has no Makefile (removed
deliberately — `make` isn't installed on this dev machine, see the `devops` agent) — the
two-command sequence above, in that order, is the only way to bring it up. Android/iOS still run
via `npx expo start` locally, not containerized.

Observability alone (run from `devops/observability/`):
```bash
make up                 # start Grafana (:3001) + Loki + Prometheus + Tempo + OTel Collector
make down
```
Every observability image is version-pinned (not `:latest`) — see `devops.md` for why that matters
concretely, not just as hygiene.

## Architecture

**Backend** — NestJS monorepo, clean/hexagonal layering (API → Application → Infrastructure, plus a
`models/` domain layer) enforced in every app — see `docs/specs/backend-architecture.md` before
writing backend code, it's the actual contract, not a suggestion. Shared code lives in `libs/`:
`auth-kernel` (JWT sign/verify, `UserRole`), `dtos` (request/response shapes more than one service
needs to agree on), and `kafka-client` (`IEventPublisher`/`KafkajsEventPublisher` — the one Kafka
producer wrapper every publishing service imports, extracted once a 4th consumer made 3
byte-identical per-service copies real duplication instead of hypothetical; `clientId` is a
constructor parameter each service supplies via its own module, not hardcoded). Password hashing is
salt+pepper+SHA-256 per `docs/specs/auth.md`'s exact formula. CORS is enabled permissively
(`origin: true`) on both Gateway and Auth Service for this Docker Compose dev phase — lock down
before any real deployment.

**Frontend** — Expo Router app, file-based routing under `app/`, with a `(tabs)` group. Redux
Toolkit for state, with a strict services-layer convention: all I/O (HTTP, WebSocket) lives in
`src/services/`, called only from thunks in `src/store/slices/`, never inline in a thunk or a
component. See `frontend/CLAUDE.md`'s "Services Layer" section before adding any new network call.
WebSocket is Socket.IO (`socketService.js`), auto-connected whenever `authSlice.accessToken`
changes (`app/_layout.js`'s `RealtimeConnectionManager`) — already built and working.

Theming is a four-layer pipeline (Redux mode → `useAppTheme` derivation → `ThemeAnimContext`
animated value → Gluestack `ThemeProvider`) — see `frontend/CLAUDE.md` for the full breakdown
before touching any of it; provider order in `app/_layout.js` is load-bearing and must not be
reordered.

**Observability** — `devops/observability/`: app → OTLP/gRPC → Collector → fans out to Loki (logs),
Prometheus (metrics), Tempo (traces), all viewable in Grafana. `gateway`/`auth`/`job-manager`/
`scraper`/`indexer` all send real telemetry via the shared `backend/libs/otel` lib. `gateway`/`auth`
get a per-request log line via `createRequestLoggingMiddleware` (HTTP-specific); `job-manager`/
`scraper`/`indexer` have no HTTP surface, so their per-message activity shows up as Kafka spans
instead (`@opentelemetry/instrumentation-kafkajs`, auto-included) — confirmed live for the Scraper
too, along with `aws-sdk` spans (`S3.PutObject`, for every SeaweedFS blob write) and outbound
`tcp.connect` spans for each page fetch, not just assumed from the metric names existing. A real
request/message produces a root-span trace in Tempo with real child spans, a log line in Loki
correlated to it by `trace_id`, and per-route-or-topic/per-status metrics in Prometheus. Each
service with no HTTP/DB surface (`job-manager`, `scraper`) has its own Grafana dashboard dropping
the panels that don't apply to it (`service-job-manager.json`, `service-scraper.json` — see
`devops.md`'s Grafana dashboard section for the pattern to copy for a new service); **the Indexer
doesn't have one yet** — it sends real telemetry (`[otel] started for service.name="indexer"`,
confirmed live), it just hasn't gotten its own dashboard file, unlike `job-manager`/`scraper`.
Two things worth knowing before touching this: (1) if the collector isn't reachable when an app
boots, telemetry export just fails — `start-otel.ts` logs that failure via `diag`, but there's no
retry buffer, so an outage means real data loss for its duration, not just a delay; (2) apps build
with plain `tsc` + `tsc-alias`, not webpack — OTel's auto-instrumentation patches `require()` at
runtime, which webpack bundling breaks.

## Key constraints to preserve

- Backend: never cross service data ownership (each service's Postgres tables are its own — see
  `docs/specs/data-model.md`); Application-layer code depends only on interfaces, never concrete
  Infrastructure classes; a domain model (`models/`) is not the same thing as an `I<Thing>`
  interface — don't conflate the two folders.
- Frontend: `scraperSlice`/`wsSlice` state must stay ephemeral (no persistence); the access token is
  never rendered/edited in the UI, only store-managed; theme persistence is automatic via
  redux-persist, don't hand-write to AsyncStorage.
- Expo 57 has breaking changes vs earlier versions; consult the versioned docs
  (https://docs.expo.dev/versions/v57.0.0/) before writing Expo/React Native code.
- **The frontend only ever talks to the Gateway, never a backend service directly** — a hard
  project rule, not just current wiring. The Gateway proxies `/auth/*`/`/me`/`/admin/users*`;
  `src/config/urls.js`'s `URLS.auth.origin` is the Gateway's origin, not Auth Service's. Don't
  build anything that bypasses it without asking first.

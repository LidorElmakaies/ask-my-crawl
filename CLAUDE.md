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
backend/                 NestJS monorepo — apps/ (gateway, auth, job-manager; four more services
                          planned, see docs/specs/services.md) + libs/ (auth-kernel, dtos,
                          kafka-contracts, otel — shared code between apps)
frontend/                 Expo / React Native app — see frontend/CLAUDE.md for details
devops/                   docker-compose.yml (app stack) + observability/ (Grafana/Loki/
                          Prometheus/Tempo/OTel — joined to the app stack via a shared Docker
                          network; gateway/auth/job-manager send real traces/logs/metrics here, see
                          backend/libs/otel)
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
  not a translation layer, per `docs/specs/services.md`.
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
- **Not implemented**: **Scraper** and **Indexer** (the crawl/scrape/index pipeline — design in
  `docs/planning/03-crawler-scraper-indexing-plan.md`), Query/Answer Service, Notification Service.
  `backend/libs/kafka-contracts` (topic names + typed Kafka payloads matching
  `docs/specs/event-schemas.md`) exists and is now imported by Job Manager Service; the
  `crawl-complete`/`page-scraped` topics still have no producer/consumer, and
  `crawl-complete-message.ts`'s shape is stale against `docs/specs/event-schemas.md` (needs a
  `page-scraped-message.ts` added too) — see the `backend` agent. Redis, SeaweedFS, and Milvus are
  part of this pipeline's design but have no `devops/` service definitions yet either — see the
  `devops` agent.

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
everything) fails to start without it already existing:
```bash
cd devops/observability && docker compose --env-file ../.env up -d   # Grafana (via Gateway's /admin/grafana, no direct port), Loki, Prometheus, Tempo, OTel Collector
cd .. && docker compose up -d --build                                # postgres, gateway (:8000), auth (:8001), job-manager, frontend (:8081), kafka (:9092)
```
`devops/.env` (copy from `devops/.env.example`) holds `PUBLIC_ORIGIN` — the single source of truth
for the deployment's public origin, read by Grafana's `GF_SERVER_ROOT_URL` and the frontend build.
`devops/observability` is a separate Compose project from `devops/` (different directory), so its
command needs the explicit `--env-file ../.env` flag to share that same file; `devops/`'s own
command picks it up automatically since Compose reads `.env` from the directory it's invoked from.
`kafka` brings up a single-broker KRaft (no Zookeeper) instance plus a one-off `kafka-init` service
that creates the five topics Job Manager Service touches (`job-requests`/`crawl-frontier`/
`job-created`/`answer-ready`/`result-saved` — matching `docs/specs/event-schemas.md`'s
partition/retention table), then exits — see the `devops` agent for image/version and listener
layout; `crawl-complete`/`page-scraped` aren't created yet, they belong to the not-yet-built
Scraper/Indexer. No `redis`
service exists — nothing currently needs it. `devops/` has no Makefile (removed deliberately —
`make` isn't installed on this dev machine, see the `devops` agent) — the two-command sequence
above, in that order, is the only way to bring it up. Android/iOS still run via `npx expo start`
locally, not containerized.

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
`auth-kernel` (JWT sign/verify, `UserRole`) and `dtos` (request/response shapes more than one
service needs to agree on). Password hashing is salt+pepper+SHA-256 per `docs/specs/auth.md`'s
exact formula. CORS is enabled permissively (`origin: true`) on both Gateway and Auth Service for
this Docker Compose dev phase — lock down before any real deployment.

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
Prometheus (metrics), Tempo (traces), all viewable in Grafana. `gateway`/`auth`/`job-manager` all
send real telemetry via the shared `backend/libs/otel` lib. `gateway`/`auth` get a per-request log
line via `createRequestLoggingMiddleware` (HTTP-specific); `job-manager` has no HTTP surface, so its
per-message activity shows up as Kafka spans instead (`@opentelemetry/instrumentation-kafkajs`,
auto-included — confirmed live, not assumed) — a real request/message produces a root-span trace in
Tempo with real child spans (HTTP/pg/kafka auto-instrumentation), a log line in Loki correlated to
it by `trace_id`, and per-route-or-topic/per-status metrics in Prometheus.
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

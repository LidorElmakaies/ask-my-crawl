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
the *why* behind the Redis design, language choice, etc. Four agent personas exist for working this
repo with agentic teams: `.claude/agents/{backend,frontend,devops,testing}.md`.

## Repo layout

```
backend/                 NestJS monorepo — apps/ (gateway, auth; five more services planned) +
                          libs/ (auth-kernel, dtos — shared code between apps)
frontend/                 Expo / React Native app — see frontend/CLAUDE.md for details
devops/                   docker-compose.yml (app stack) + observability/ (Grafana/Loki/
                          Prometheus/Tempo/OTel — not yet wired to receive telemetry from
                          the app stack; separate, unconnected compose project for now)
docs/specs/               Formal specs — source of truth for how the system is supposed to work
docs/planning/            Raw decision log — why things are the way they are
```

## What's actually implemented right now

- **Gateway** (`backend/apps/gateway`) — Socket.IO realtime layer: authenticates the WS handshake
  (JWT via `@app/auth-kernel`), pushes events to connected users. No HTTP routes yet.
- **Auth Service** (`backend/apps/auth`) — register/login/refresh/logout, `/me`, `/admin/users*`.
  Full clean-architecture implementation, Postgres via TypeORM. Runs standalone on its own port —
  **the Gateway does not yet proxy `/auth/*` to it** (tracked in `docs/specs/services.md`); the
  frontend currently calls Auth Service directly at its own origin.
- **Not built yet**: Crawl Worker, Search Result Manager, Query/Answer Service, Notification
  Service, Crawl Result Manager, the Gateway↔Auth Service proxy wiring, and the frontend's
  login/register screens (in progress).

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

**Easiest way to run the whole backend + web frontend together**: Docker Compose.
```bash
cd devops
docker compose up -d --build   # postgres, gateway (:8000), auth (:8001), frontend web preview (:8081)
```
(`make up` also works if you have `make` installed — not guaranteed on bare Windows/PowerShell, see
the `devops` agent.) Android/iOS still run via `npx expo start` locally, not containerized.

Observability stack (run from `devops/observability/`) — currently unconnected to the app stack,
nothing emits telemetry yet:
```bash
make up                 # start Grafana (:3000) + Loki + Prometheus + Tempo + OTel Collector
make down
```

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

**Observability** — self-contained OTel stack (`devops/observability/`): app → OTLP → Collector →
Loki/Prometheus/Tempo → Grafana. Not yet connected to the app stack (`devops/docker-compose.yml`
runs as a separate, unjoined compose project) and nothing currently emits telemetry — infrastructure
for later, not active yet.

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
- Once the Gateway proxies `/auth/*`, switch the frontend's Auth Service origin to the Gateway's —
  that should be a one-line config change (`src/config/urls.js`), not a rewrite, thanks to the
  services-layer pattern. Don't build anything that would make that swap harder.

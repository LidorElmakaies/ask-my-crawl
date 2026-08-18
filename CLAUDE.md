# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

askmycrawl crawls a URL, answers a question about that page's content using AI, and (planned) notifies the
user by email and SMS when the result is ready, with a dedicated tab in the UI for that notification flow.

It was bootstrapped from a sibling project called `crawlqa` (frontend + observability stack only — no
backend was carried over). The scrape endpoint the frontend currently calls (`POST /api/scrape`) does not
exist in this repo yet; there is no backend here at all. Treat `frontend/src/config/urls.js`'s
`http://localhost:8000` as a placeholder until a real backend is added.

## Repo layout

```
frontend/               Expo / React Native app — see frontend/CLAUDE.md for details
devops/observability/   Local Grafana+Loki+Prometheus+Tempo+OTel stack (Docker Compose)
```

There is no backend directory yet — it will need to be created (crawl/scrape logic, the AI query step, and
email/SMS notification delivery).

## Commands

Frontend (run from `frontend/`):
```bash
npm install
npx expo start          # Expo Go / dev client
npx expo start --android
npx expo start --ios
npx expo start --web
```
No lint/test/build scripts are defined in `frontend/package.json` beyond the `expo start` variants above.

Observability stack (run from `devops/observability/`):
```bash
make up                 # start Grafana (:3000) + Loki + Prometheus + Tempo + OTel Collector
make down                # stop, keep data
make logs                # tail all services
make logs-<name>         # tail one service (otel-collector, loki, prometheus, tempo, grafana)
make restart s=<name>
make clean                # stop and wipe ./data/
```

## Architecture

**Frontend** — Expo Router app, file-based routing under `app/`, with a `(tabs)` group
(`index` / `scraper` / `settings`). State is Redux Toolkit: `scraperSlice` (ephemeral — result/status/error,
cleared on reload, never persisted) and `themeSlice` (persisted via redux-persist → AsyncStorage). The
scraper flow is a single async thunk (`submitScrapeRequest`) that POSTs `{ url }` to
`URLS.gateway.scrape` and stores the raw JSON response.

Theming is a four-layer pipeline (Redux mode → `useAppTheme` derivation → `ThemeAnimContext` animated
value → Gluestack `ThemeProvider`) — see `frontend/CLAUDE.md` for the full breakdown before touching any of
it, provider order in `app/_layout.js` is load-bearing and must not be reordered.

**Observability** — self-contained OTel stack: app → OTLP (:4317 gRPC / :4318 HTTP) → Collector → fans out
to Loki (logs), Prometheus (metrics), Tempo (traces), all visualized in Grafana. Nothing in the frontend
currently emits OTel telemetry; this is infrastructure for whatever backend gets added. Config in
`docker-compose.yml` / `otel-collector/config.yaml` / etc. is also meant to be the source of truth for a
future Kubernetes deployment (see `devops/observability/README.md`).

## Key constraints to preserve

- `scraperSlice` state must stay ephemeral — do not add persistence to it.
- Theme persistence is automatic via redux-persist — don't hand-write to AsyncStorage.
- Expo 57 has breaking changes vs earlier versions; consult the versioned docs
  (https://docs.expo.dev/versions/v57.0.0/) before writing Expo/React Native code, per
  `frontend/AGENTS.md` and `frontend/CLAUDE.md`.
- Once a backend exists, update `frontend/src/config/urls.js` (`BASE_URL`) to point at it instead of
  assuming `localhost:8000`.

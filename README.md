# askmycrawl

Give it a URL and a question. It crawls the page (and same-domain links it finds), indexes what it
reads into a vector database, answers your question about that content using a RAG pipeline over an
LLM, and pushes the answer to you live in the app the moment it's ready — with email/SMS/Telegram
notification planned on top of the live WebSocket update. Access is role-based (`admin`/`user`); an
admin also gets a user-management panel and read-only Grafana/Kafka-UI views, both proxied through
the same Gateway the frontend already talks to.

Bootstrapped from a sibling project called `crawlqa` (frontend + observability stack only — the
entire backend below was built from scratch in this repo).

## How it works, in one pass

```
URL + question  →  Gateway  →  Job Manager  →  Scraper  →  Indexer  →  Query/Answer  →  live answer
                                (owns jobs)    (crawls,     (chunks,    (RAG over an     pushed via
                                               stores raw   embeds,     LLM, using       WebSocket
                                               HTML)        upserts     Qdrant search)
                                                            to Qdrant)
```

Every arrow above is a Kafka message, not a direct call — each service is an independent NestJS
microservice with its own responsibility and (where it needs one) its own slice of Postgres/Redis.
See [docs/specs/README.md](docs/specs/README.md) for the full spec set (data model, event schemas,
API contracts, auth) and [docs/planning/01-architecture-notes.md](docs/planning/01-architecture-notes.md)
for the reasoning behind the harder decisions. [CLAUDE.md](CLAUDE.md) has the current
implemented-vs-planned status of every service.

## Stack

- **Backend** — NestJS monorepo: Gateway (the *only* thing the frontend ever talks to — realtime
  WebSocket layer + HTTP proxy to Auth Service + job submission), Auth Service, Job Manager, Scraper,
  Indexer, Query/Answer. Kafka for inter-service messaging, Postgres for relational data, Redis for
  BullMQ queues + per-job crawl coordination, SeaweedFS (S3-compatible) for raw HTML, Qdrant for
  vectors.
- **Frontend** — Expo / React Native (Expo Router, Redux Toolkit, Gluestack UI), talks only to the
  Gateway.
- **Observability** — Grafana + Loki + Prometheus + Tempo + an OTel Collector, fed real traces/logs/
  metrics from every backend service.
- **LLM** — any OpenAI-compatible `/v1/embeddings` + `/v1/chat/completions` server, config-driven
  (defaults to a local LM Studio instance, swappable to a hosted provider with no code change).

## Requirements

- **Docker Desktop** (or Docker Engine + the Compose plugin) — **Compose v2.20+** specifically; the
  app stack's `include:` key needs it.
- **Node.js 18+** and npm, only if you're running a backend app or the frontend outside Docker.
- **LM Studio** (or another OpenAI-compatible server) running locally with its local server enabled
  on port `1234` — one embedding model loaded (default: `text-embedding-nomic-embed-text-v1.5`,
  768 dimensions) and one chat-capable model (default: `local-model`, or your own via `LLM_MODEL`).
  This is the one piece nothing in `docker compose up` starts for you.
- **Expo Go** (or a dev client) if you want to run the frontend on an actual Android/iOS device
  instead of the web preview.

## Setup

1. **Clone, then create your env files** (never commit either of these — both are gitignored):
   ```bash
   cp devops/.env.example devops/.env
   cp backend/.env.example backend/.env
   ```
   In `backend/.env`, fill in real values for `JWT_SECRET`, `PASSWORD_PEPPER`,
   `SEAWEEDFS_ACCESS_KEY`/`SEAWEEDFS_SECRET_KEY` — every other value has a working default for a
   local Docker Compose run. `devops/.env`'s `PUBLIC_ORIGIN` only needs changing for a non-local
   deployment (it defaults to `http://localhost:8000`).
2. **Start LM Studio** locally with its server on, the embedding model and a chat model both loaded.
3. **Bring up observability first** — the app stack's Docker network depends on it existing:
   ```bash
   cd devops/observability && docker compose --env-file ../.env up -d
   ```
4. **Bring up the app stack**:
   ```bash
   cd .. && docker compose up -d --build
   ```
5. **Open the app**: `http://localhost:8081` (web preview). The Gateway's API/WebSocket is at
   `http://localhost:8000`. Register a user, or log in as the bootstrapped admin
   (`ADMIN_EMAIL`/`ADMIN_PASSWORD` in `backend/.env`, default `admin@gmail.com` / `admin`) to reach
   `/admin` — user management, plus Grafana and Kafka UI proxied at `/admin/grafana` and
   `/admin/kafka-ui`.

Everything above is `postgres`, `redis`, `seaweedfs`, `qdrant`, `kafka` (+ topic init + Kafka UI),
`gateway` (`:8000`), `auth` (`:8001`), `job-manager`, `scraper`, `indexer`, `query-answer`, and
`frontend` (`:8081`) — twelve services and a one-off topic-creation job, all wired together by
`devops/docker-compose.yml`'s `include:`.

### Running a backend app outside Docker

```bash
cd backend
npm install
npx nest start gateway --watch    # or: auth, job-manager, scraper, indexer, query-answer
```

`backend/.env`'s localhost-based values are for exactly this case — Docker Compose overrides every
one of them to the in-network container hostname via each service's own `environment:` block, so
you don't need two separate env files.

### Running the frontend outside Docker

```bash
cd frontend
npm install
npx expo start           # Expo Go / dev client
npx expo start --web
npx expo start --android
npx expo start --ios
```

The backend must already be reachable at whatever origin `frontend/src/config/urls.js` resolves to
(`EXPO_PUBLIC_GATEWAY_ORIGIN`, defaulting to `http://localhost:8000`).

## Tests

```bash
cd backend
npm test                    # unit tests, every app/lib
npm run test:e2e:gateway    # e2e — real Socket.IO handshake, no external deps
npm run test:e2e:auth       # e2e — real Postgres via testcontainers, needs Docker
npm run lint
```

## Project layout

```
backend/    NestJS monorepo — apps/ (gateway, auth, job-manager, scraper, indexer, query-answer)
            + libs/ (auth-kernel, dtos, kafka-contracts, kafka-client, otel — shared code)
frontend/   Expo / React Native app
devops/     docker-compose.yml (app stack) + observability/ (Grafana/Loki/Prometheus/Tempo/OTel)
docs/       specs/ (source of truth for how the system works) + planning/ (why it's built this way)
```

See [CLAUDE.md](CLAUDE.md) for the exact current state of each service (what's built, what's still
a stub) and the four agent personas (`.claude/agents/`) this repo is developed with.

## License

MIT — see [LICENSE](LICENSE).

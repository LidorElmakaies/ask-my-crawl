# askmycrawl — Specs

Formal specification set, superseding the raw capture in [`../planning/01-architecture-notes.md`](../planning/01-architecture-notes.md)
(kept around as the record of *why* these decisions were made).

- [data-model.md](data-model.md) — Postgres schema (incl. pgvector), which service owns which tables
- [event-schemas.md](event-schemas.md) — Kafka topics, message shapes, producers/consumers
- [api-contracts.md](api-contracts.md) — REST + WebSocket surface, roles required per endpoint
- [services.md](services.md) — one service per section: responsibility, owns-what, talks-to-what
- [auth.md](auth.md) — roles, registration, password hashing, token strategy
- [backend-architecture.md](backend-architecture.md) — the API/Application/Infrastructure clean-architecture layering every NestJS service follows

## Agent personas

For working this project with agentic teams (Claude Code subagents, spawnable via the `backend`,
`frontend`, `devops`, and `testing` agent types): [`.claude/agents/`](../../.claude/agents/).

## Stack (decided)

- **Backend**: NestJS (Node.js/TypeScript) for every service — Gateway, Auth, Crawl Worker, Search
  Result Manager, Query/Answer, Notification, Crawl Result Manager. `langchain.js` for crawl-cleaning,
  embeddings, and the RAG step. See [planning notes §4](../planning/01-architecture-notes.md#4-language--decided-nestjs-nodejstypescript-all-services)
  for the "why."
- **Message bus**: Kafka (via `@nestjs/microservices`).
- **Cache/coordination**: Redis — per-job visited set, 3-day global content cache, fan-in completion
  counter. See [planning notes §3](../planning/01-architecture-notes.md#3-redis--decided-design).
- **Storage**: Postgres, with the `pgvector` extension for embeddings. Auth Service uses TypeORM
  (`synchronize: true` outside production — no migration framework yet, see `auth.md`); other
  services' DB access approach is TBD when each gets built.
- **Internal service-to-service calls**: plain HTTP via Nest's `HttpModule` — see `services.md`.
- **Notifications**: email, SMS, Telegram Bot API.
- **Frontend**: existing Expo/React Native app in `frontend/` (see [frontend/CLAUDE.md](../../frontend/CLAUDE.md)),
  built from reusable components (shared input fields etc. across screens) rather than per-screen markup.
- **Deployment**: Docker Compose for now (`devops/docker-compose.yml`, alongside the existing
  `devops/observability/`) — AWS is a documented future phase, not the current target. See the
  `devops` agent for how it's built/extended (including OpenTelemetry wiring, Grafana dashboards)
  and [devops/observability/README.md](../../devops/observability/README.md) for how to run and
  use the observability stack day to day.

## Still open (tracked, not blocking)

- LLM + embedding model provider (affects `vector` column dimension in the data model).
- Email/SMS provider choice (SMTP vs SendGrid/etc., Twilio vs alternatives).
- Telegram account-linking flow (bot deep-link / linking code).
- CORS is permissively open (`origin: true`) on the Gateway for this dev phase — needs locking
  down to specific origins before any real deployment. Auth Service's own CORS is now dead config
  worth removing (or its host port unpublished) rather than tightening — since the Gateway now
  proxies every route, nothing browser-side calls Auth Service directly anymore, so CORS is moot
  there; not done yet, flagging rather than silently deciding either way.
- Whether refresh tokens (or an access-token revocation list) should move to Redis for faster
  lookups — if so, that's an Auth-Service-internal swap behind `IRefreshTokenRepository`, not
  something the Gateway reaches into directly (breaks the per-service data-ownership rule).
- URL-normalization edge cases (tracking params, redirect-following).
- IaC tool (Terraform vs CDK) and CI/CD pipeline for AWS deployment.

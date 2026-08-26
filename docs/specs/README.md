# askmycrawl — Specs

Formal specification set, superseding the raw capture in [`../planning/01-architecture-notes.md`](../planning/01-architecture-notes.md)
(kept around as the record of *why* these decisions were made).

- [data-model.md](data-model.md) — Postgres schema (relational data only — embeddings live in
  Milvus, not pgvector), which service owns which tables
- [event-schemas.md](event-schemas.md) — Kafka topics, message shapes, producers/consumers
- [api-contracts.md](api-contracts.md) — REST + WebSocket surface, roles required per endpoint
- [services.md](services.md) — one service per section: responsibility, owns-what, talks-to-what
- [auth.md](auth.md) — roles, registration, password hashing, token strategy
- [backend-architecture.md](backend-architecture.md) — the API/Application/Infrastructure clean-architecture layering every NestJS service follows

## Agent personas

For working this project with agentic teams (Claude Code subagents, spawnable via the `backend`,
`frontend`, `devops`, and `testing` agent types): [`.claude/agents/`](../../.claude/agents/).

## Stack

- **Backend**: NestJS (Node.js/TypeScript) for every service — Gateway, Auth, Scraper, Indexer,
  Query/Answer, Notification, Job Manager Service. `langchain.js` for crawl-cleaning, embeddings,
  and the RAG step. See [planning notes §2](../planning/01-architecture-notes.md#2-language--decided-nestjs-nodejstypescript-all-services)
  for the "why."
- **Message bus**: Kafka (via `@nestjs/microservices`) — `backend/libs/kafka-contracts` (topic
  names + message shapes) and the broker/topic-init exist; no producer/consumer is wired up yet.
  **BullMQ** (Redis-backed) sits alongside Kafka for the Scraper's and Indexer's own retry/backoff
  (`process-url`, `index-page` queues) — see [the full plan](../planning/03-crawler-scraper-indexing-plan.md).
- **Cache/coordination**: **Redis, not implemented.** Scoped narrowly to per-job coordination state
  for the Scraper/Indexer pipeline (dedup set, pending-work counters, a completion race guard) plus
  BullMQ's own queue keys — not a general-purpose cache, and not owned data the way a Postgres table
  is (shared between the two services, like the Kafka topics between them). Full key list in the
  plan doc above.
- **Storage**: Postgres for relational data (users, jobs, notifications) — `pgvector` isn't needed;
  embeddings live in a self-hosted **Milvus** instance instead. Auth Service uses TypeORM
  (`synchronize: true` outside production — no migration framework yet, see `auth.md`); other
  services' DB access approach is TBD when each gets built. Raw scraped HTML goes to a self-hosted
  **SeaweedFS** instance (S3-compatible blob store), not Postgres — see `data-model.md`.
- **Embeddings**: self-hosted via **LM Studio** (OpenAI-compatible local API — `OpenAIEmbeddings`
  from `@langchain/openai`, pointed at LM Studio's server). LM Studio itself is a desktop app, not a
  container — the Indexer reaches it over a host address, not a compose service name. Which
  specific GGUF embedding model to load is still open (determines the Milvus vector dimension).
- **Internal service-to-service calls**: plain HTTP via Nest's `HttpModule` — see `services.md`.
  (The Scraper and Indexer are the exception — they never call each other synchronously, only via
  Kafka + shared Redis state.)
- **Notifications**: email, SMS, Telegram Bot API.
- **Frontend**: existing Expo/React Native app in `frontend/` (see [frontend/CLAUDE.md](../../frontend/CLAUDE.md)),
  built from reusable components (shared input fields etc. across screens) rather than per-screen markup.
- **Deployment**: Docker Compose for now (`devops/docker-compose.yml`, alongside the existing
  `devops/observability/`) — AWS is a documented future phase, not the current target. See the
  `devops` agent for how it's built/extended (including OpenTelemetry wiring, Grafana dashboards)
  and [devops/observability/README.md](../../devops/observability/README.md) for how to run and
  use the observability stack day to day. Redis, SeaweedFS, and Milvus have no `devops/` service
  definitions yet — they get added when the Scraper/Indexer are actually built, not speculatively.

## Still open (tracked, not blocking)

- LLM (answer-generation) provider — the *embedding* model provider is decided (self-hosted, LM
  Studio), but which specific model to load in LM Studio (affects the Milvus vector dimension) and
  which LLM API answers the RAG step are both still open.
- Email/SMS provider choice (SMTP vs SendGrid/etc., Twilio vs alternatives).
- Telegram account-linking flow (bot deep-link / linking code).
- CORS is permissively open (`origin: true`) on the Gateway for this dev phase — needs locking down
  to specific origins before any real deployment. Auth Service's own CORS is dead config worth
  removing (or its host port unpublished) rather than tightening — the Gateway proxies every route,
  so nothing browser-side calls Auth Service directly, meaning CORS is moot there; not done yet,
  flagging rather than silently deciding either way.
- Whether refresh tokens (or an access-token revocation list) should move to Redis for faster
  lookups — if so, that's an Auth-Service-internal swap behind `IRefreshTokenRepository`, not
  something the Gateway reaches into directly (breaks the per-service data-ownership rule). If this
  happens, it would most likely reuse the Scraper/Indexer's own Redis instance rather than standing
  up a second one — not decided, flag before assuming either way.
- URL-normalization edge cases (tracking params, redirect-following).
- Per-domain rate limiting for the Scraper — a stub hook exists by design, intentionally
  unimplemented.
- The Indexer's query-time retrieval API for Query/Answer Service — not designed yet, see
  `services.md`'s Indexer section.
- IaC tool (Terraform vs CDK) and CI/CD pipeline for AWS deployment.

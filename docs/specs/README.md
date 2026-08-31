# askmycrawl — Specs

Formal specification set, superseding the raw capture in [`../planning/01-architecture-notes.md`](../planning/01-architecture-notes.md)
(kept around as the record of *why* these decisions were made).

- [data-model.md](data-model.md) — Postgres schema (relational data only — embeddings live in
  Qdrant, not pgvector), which service owns which tables
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
  Query/Answer, Notification, Job Manager Service. `langchain.js` for the Indexer's embedding step
  and Query/Answer's RAG step (the Scraper doesn't use LangChain — it's plain HTTP fetch + cheerio).
  See [planning notes §2](../planning/01-architecture-notes.md#2-language--decided-nestjs-nodejstypescript-all-services)
  for the "why."
- **Message bus**: Kafka (via `@nestjs/microservices`) — `backend/libs/kafka-contracts` (topic
  names + message shapes) and the broker/topic-init exist; Job Manager Service, the Scraper, and the
  Indexer are all real producers/consumers today. **BullMQ** (Redis-backed) sits alongside Kafka for
  the Scraper's and Indexer's own retry/backoff (`process-url`, `index-page` queues), used raw
  (`bullmq`'s own `Queue`/`Worker` classes, not `@nestjs/bullmq`'s decorators — matches this
  project's existing kafkajs-used-raw precedent) — see
  [the full plan](../planning/03-crawler-scraper-indexing-plan.md).
- **Cache/coordination**: **Redis** (`devops/redis`, one shared instance). Scoped narrowly to
  per-job coordination state for the Scraper/Indexer pipeline (dedup set, pending-work counters, a
  completion guard) plus BullMQ's own queue keys — not a general-purpose cache, and not owned data
  the way a Postgres table is. Full key list in the plan doc above.
- **Storage**: Postgres for relational data (users, jobs, notifications) — `pgvector` isn't needed;
  embeddings live in a self-hosted **Qdrant** instance instead. Auth Service and Job Manager Service
  both use TypeORM against the same shared `askmycrawl` database (`synchronize: true` outside
  production — no migration framework yet, see `auth.md`). Raw scraped HTML goes to a self-hosted
  **SeaweedFS** instance (S3-compatible blob store, `devops/seaweedfs`), not Postgres — see
  `data-model.md`.
- **Embeddings**: self-hosted via **LM Studio** (OpenAI-compatible local API — `OpenAIEmbeddings`
  from `@langchain/openai`, pointed at any OpenAI-compatible server via `EMBEDDING_BASE_URL`,
  swappable with no code change). LM Studio itself is a desktop app, not a container — the Indexer
  reaches it over a host address, not a compose service name. Current default model:
  `text-embedding-nomic-embed-text-v1.5`, 768-dim.
- **Internal service-to-service calls**: plain HTTP via Nest's `HttpModule` — see `services.md`.
  (The Scraper and Indexer are the exception — they never call each other synchronously, only via
  Kafka + shared Redis state.)
- **Notifications**: email, SMS, Telegram Bot API — not implemented yet (Notification Service).
- **Frontend**: existing Expo/React Native app in `frontend/` (see [frontend/CLAUDE.md](../../frontend/CLAUDE.md)),
  built from reusable components (shared input fields etc. across screens) rather than per-screen markup.
- **Deployment**: Docker Compose (`devops/docker-compose.yml`, alongside `devops/observability/`) —
  AWS is a documented future phase, not the current target. See the `devops` agent for how it's
  built/extended (including OpenTelemetry wiring, Grafana dashboards) and
  [devops/observability/README.md](../../devops/observability/README.md) for how to run and use the
  observability stack day to day.

## Not yet built

The crawl-and-index pipeline is complete and working end to end — a submitted job gets crawled,
scraped, chunked, embedded, and stored in Qdrant. What's missing is the step that turns that into an
actual answer:

- **Query/Answer Service** — not implemented. The one remaining piece of the RAG loop: on
  `crawl-complete`, retrieve the top-k relevant chunks from the Indexer for the job's query, pass
  them plus the query to an LLM, publish `answer-ready`. See `services.md`'s Query/Answer section.
- **Notification Service** — not implemented. On `answer-ready`, send email/SMS/Telegram.

## Still open (tracked, not blocking)

- LLM (answer-generation) provider for Query/Answer Service — not decided.
- Email/SMS provider choice (SMTP vs SendGrid/etc., Twilio vs alternatives).
- Telegram account-linking flow (bot deep-link / linking code).
- CORS is permissively open (`origin: true`) on the Gateway for this dev phase — needs locking down
  to specific origins before any real deployment.
- Whether refresh tokens (or an access-token revocation list) should move to Redis for faster
  lookups — not decided.
- Per-domain rate limiting for the Scraper — not implemented.
- The Indexer's query-time retrieval API for Query/Answer Service — not designed yet, see
  `services.md`'s Indexer section.
- IaC tool (Terraform vs CDK) and CI/CD pipeline for AWS deployment.

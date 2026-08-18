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
- **Storage**: Postgres, with the `pgvector` extension for embeddings.
- **Notifications**: email, SMS, Telegram Bot API.
- **Frontend**: existing Expo/React Native app in `frontend/` (see [frontend/CLAUDE.md](../../frontend/CLAUDE.md)),
  built from reusable components (shared input fields etc. across screens) rather than per-screen markup.
- **Deployment**: Docker Compose for now (`devops/docker-compose.yml`, alongside the existing
  `devops/observability/`) — AWS is a documented future phase, not the current target. See the
  `devops` agent.

## Still open (tracked, not blocking)

- LLM + embedding model provider (affects `vector` column dimension in the data model).
- Email/SMS provider choice (SMTP vs SendGrid/etc., Twilio vs alternatives).
- Telegram account-linking flow (bot deep-link / linking code).
- First-admin bootstrap mechanism.
- URL-normalization edge cases (tracking params, redirect-following).
- Internal (service-to-service) call transport — plain HTTP vs NestJS TCP microservice transport.
- IaC tool (Terraform vs CDK) and CI/CD pipeline for AWS deployment.

# Services

Seven NestJS services. Each owns its own slice of the data model (see `data-model.md`) — other
services reach that data only through its API or its Kafka events, never a direct cross-service
table read/write.

```
                         ┌────────────────────┐
   Client (frontend) ───▶│      Gateway        │◀── WS (result-saved consumer)
                         │  HTTP + WS, guards   │
                         └──────────┬──────────┘
                     token invalid  │  token valid: create job, publish seed
                          ▼         ▼
                  ┌───────────┐   crawl-frontier (Kafka)
                  │   Auth    │        │
                  │  Service  │        ▼
                  │(Postgres) │  ┌──────────────┐   internal call    ┌────────────────┐
                  └───────────┘  │ Crawl Worker │───────────────────▶│ Search Result   │
                                  │ pool          │◀── content/links ──│ Manager         │
                                  └──────┬───────┘                   │ (Postgres+vector)│
                                         │ crawl-complete             └────────────────┘
                                         ▼                                    ▲
                                  ┌──────────────┐   similarity search        │
                                  │ Query/Answer │────────────────────────────┘
                                  │   Service     │──▶ LLM (external API)
                                  └──────┬───────┘
                                         │ answer-ready
                            ┌────────────┴────────────┐
                            ▼                          ▼
                  ┌──────────────────┐       ┌─────────────────────┐
                  │ Notification Svc │       │ Crawl Result Manager │
                  │ email/SMS/Telegram│      │ (Postgres: jobs,     │
                  └──────────────────┘       │  results)            │
                                              └──────────┬───────────┘
                                                          │ result-saved
                                                          ▼
                                                     Gateway (WS push)
```

## Gateway

- **Owns**: nothing in Postgres — stateless HTTP/WS edge.
- **Responsibilities**: terminate HTTP + WebSocket connections; verify JWT locally (see `auth.md`);
  proxy `/auth/*` to Auth Service; on `POST /jobs`, call Crawl Result Manager internally to create
  the job row, then publish the seed `crawl-frontier` message; on `GET /jobs*`, call Crawl Result
  Manager internally; on `GET/PATCH /admin/users*`, call Auth Service internally; maintain an
  in-memory (or Redis-backed, for multi-instance deployments) `user_id → WebSocket` registry; consume
  `result-saved` and push to the matching connection.
- **Talks to**: Auth Service (internal call), Crawl Result Manager (internal call), Kafka (produces
  `crawl-frontier`, consumes `result-saved`).

## Auth Service

- **Owns**: `users`, `refresh_tokens`.
- **Responsibilities**: registration (hash password per `auth.md`), login, refresh-token issuance +
  rotation + revocation, admin user CRUD.
- **Talks to**: Postgres only. No Kafka involvement.

## Crawl Worker (pool)

- **Owns**: nothing directly — writes to Search Result Manager and Redis, not Postgres directly.
- **Responsibilities**: implements the pipeline in `planning/01-architecture-notes.md` §2–3 —
  per-job visited-set claim, 3-day global cache check, fetch + LangChain clean, hand content to
  Search Result Manager, expand BFS onto `crawl-frontier`, maintain the fan-in `pending` counter,
  fire `crawl-complete` when it hits zero.
- **Talks to**: Redis (visited set, cache marker, pending counter), Search Result Manager (internal
  call — synchronous, because the worker needs the resulting `page_id` and `outbound_links`
  immediately to continue its own BFS step), Kafka (`crawl-frontier` in/out, `crawl-complete` out,
  `crawl-frontier-dlq` out on unrecoverable failure).

## Search Result Manager

- **Owns**: `pages`, `page_chunks`, `job_pages`.
- **Responsibilities**: given cleaned page content — chunk it, generate embeddings, upsert the
  `pages`/`page_chunks` rows (keyed by normalized URL, replacing stale content on re-scrape), insert
  the `job_pages` association row; given a `job_id` + query — run a `pgvector` similarity search
  scoped to that job's `job_pages` and return top-k chunks.
- **Talks to**: Postgres only, via internal calls from Crawl Worker (write path) and Query/Answer
  Service (read path). No Kafka involvement.

## Query/Answer Service

- **Responsibilities**: on `crawl-complete`, call Search Result Manager for the top-k relevant
  chunks for that job's query, pass them + the query to an LLM, publish `answer-ready`.
- **Owns**: nothing in Postgres.
- **Talks to**: Search Result Manager (internal call), an external LLM API (provider TBD), Kafka
  (`crawl-complete` in, `answer-ready` out).

## Notification Service

- **Owns**: `notifications_log`.
- **Responsibilities**: on `answer-ready`, look up the user's contact info (via internal call to
  Auth Service) and send email + SMS + Telegram, logging each attempt.
- **Talks to**: Auth Service (internal call, contact info), external email/SMS/Telegram providers
  (TBD), Kafka (`answer-ready` in), Postgres (`notifications_log`).

## Crawl Result Manager

- **Owns**: `jobs`, `results`.
- **Responsibilities**: create a job row (called synchronously by Gateway on job submission); on
  `answer-ready`, persist the `results` row, update `jobs.status = 'completed'`, publish
  `result-saved`.
- **Talks to**: Gateway (internal call, inbound), Kafka (`answer-ready` in, `result-saved` out),
  Postgres (`jobs`, `results`).

## Internal (service-to-service) calls

Not yet decided: plain HTTP within the cluster vs NestJS's TCP microservice transport for the
synchronous internal calls listed above (Gateway↔Auth, Gateway↔Crawl Result Manager, Crawl
Worker↔Search Result Manager, Query/Answer↔Search Result Manager, Notification↔Auth). Both are
supported natively by NestJS; pick one convention and use it everywhere rather than mixing — TBD
for the devops/AGENTS.md pass.

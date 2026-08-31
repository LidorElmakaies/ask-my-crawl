# askmycrawl — Architecture Notes

Why the backend is shaped the way it is, for the parts `docs/specs/` states as rules without
explaining the reasoning behind them.

## 1. Product shape

- Multi-user, role-based app: **admin** and **user**.
  - Users self-register. Passwords stored as **salt + pepper + SHA-256** (see `docs/specs/auth.md`).
  - **Admin**: list/update/delete any user, view all requests and all results across all users.
  - **User**: can only view/update their own requests and results.
- Core action: user submits a **URL + a question/query**. Crawling happens in the background — the
  user can navigate away and come back.
- Crawl depth is capped at **3**.
- On completion the user is notified three ways: **email**, **SMS**, and **Telegram** (a Telegram
  Bot API chat message to the user's linked chat ID).
- Frontend also gets a **live update** (WebSocket) so the answer shows up in the UI tab without a
  refresh, in addition to the email/SMS/Telegram notifications.

## 2. Why NestJS for every service

One runtime/language across the whole backend, including the LangChain-heavy services (the
Indexer's chunk/embed step, Query/Answer's RAG step) — using `langchain.js` there:

- `@nestjs/microservices` has built-in Kafka support (on kafkajs) — each backend service can be a
  Nest microservice app with `@EventPattern(...)`/`@MessagePattern(...)` handlers on the shared
  Kafka topics (`docs/specs/event-schemas.md`).
- `@nestjs/websockets` covers the Gateway's "hold an open WS per user, push live results"
  requirement.
- Guards map cleanly onto "Gateway validates token, routes to Auth Service if invalid."
- DI + module structure gives every service (Gateway, Auth, Scraper, Indexer, Query/Answer,
  Notification, Job Manager Service) the same consistent shape.

Trade-off accepted: `langchain.js` is less mature than Python's `langchain` (fewer integrations,
smaller community) — acceptable in exchange for one language/runtime/deploy pipeline across all
services instead of splitting the stack.

## 3. Why job creation is Kafka-decoupled, not a synchronous Gateway→Job Manager Service call

`POST /jobs` publishes a `job-requests` message and responds `202` immediately, with no `job_id` in
that response — Job Manager Service creates the row and publishes `job-created` separately, which
Gateway relays over WebSocket the same way it relays `result-saved` (see `services.md`,
`event-schemas.md`). Reads (`GET /jobs*`) stay a synchronous internal call — decoupling a read buys
nothing and would just add latency.

**Why**: the write path was the one place Gateway synchronously depended on a downstream service's
availability to answer an HTTP request, while every later stage of the same pipeline is already
event-driven. This keeps job creation consistent with that shape, and means Job Manager Service
being down no longer makes `POST /jobs` itself fail — the request just queues. Trade-off: a client
that submits a job and immediately disconnects has no synchronous way to learn its `job_id` — only
the WebSocket relay or a later `GET /jobs` poll.

## 4. Why the Scraper and Indexer are two separate services, not one

An earlier single combined "Crawl Worker" design (one service, BFS pipeline + heavy Redis
coordination — a visited set, a fan-in/fan-out completion counter, a global content-freshness cache,
a stuck-job reconciliation sweep, a per-domain rate limiter) was built once and then reverted in
full — it had accumulated more atomic Redis operations than made sense to reason about as one
service. The current design (§5) rebuilt it from nothing as two single-concern services instead:
**Scraper** (fetch + BFS-expand) and **Indexer** (clean + chunk + embed + store) — full mechanism in
[`03-crawler-scraper-indexing-plan.md`](03-crawler-scraper-indexing-plan.md). `backend/libs/
kafka-contracts` (topic names + typed payloads) survived the revert as the agreed wire contract.

## 5. Why the Scraper/Indexer pipeline is shaped the way it is

- **Redis is back, but scoped narrow**: no global content-freshness cache, no per-domain rate
  limiter, no reconciliation sweep — just a per-`job_id` dedup set, two pending-work counters, and a
  `SET NX` completion guard. **BullMQ** (Redis-backed) owns retry/backoff for both the scrape and
  index stages, instead of hand-rolled Kafka retry/DLQ topics, absorbing the retry/failure
  bookkeeping that used to be bespoke Redis operations in the reverted design.
- **Storage lives off Postgres for this slice**: raw HTML → **SeaweedFS** (self-hosted,
  S3-compatible blob store), embeddings → **Qdrant** (self-hosted vector DB) — not the
  Postgres+pgvector design `data-model.md` once described. Neither the Scraper nor the Indexer owns
  a Postgres table.
- **Embedding model is self-hosted via LM Studio** (OpenAI-compatible local API,
  `OpenAIEmbeddings` from `@langchain/openai`, swappable via `EMBEDDING_BASE_URL`) — the LLM
  *answer-generation* provider (Query/Answer Service) is a separate, still-open decision.
- `page-scraped` (Kafka) bridges Scraper → Indexer — same Kafka→BullMQ bridge pattern on both sides,
  which is why the two services mirror each other structurally.
- `crawl-complete`'s payload is a full result summary (`succeeded_count`/`failed_count`/
  `succeeded_urls`/`failed_urls`), not just a thin trigger — enough for Query/Answer Service to act
  without a callback.

See the plan doc for the full mechanism (Frontier Consumer dedup, Scraper Worker steps, Index Intake
Consumer, Indexing Worker steps, completion detection, Redis key table).

## 6. Why the `jobs` table is minimal

One table: `id` (generated), `user_id`, `url`, `query`, `result` (`NULL` until answered). No `status`
enum, no `depth_limit` (max depth is a fixed constant used only by the Scraper), no `error_message`,
no timestamps, no separate `results` table — Job Manager Service's whole write surface is "insert the
3 fields the client sent plus a generated id and a NULL result" and, later, "fill in `result`." See
`docs/specs/data-model.md`'s `jobs` table note for the real gap this leaves (a failed job has no
representation at all, just stays `NULL` forever).

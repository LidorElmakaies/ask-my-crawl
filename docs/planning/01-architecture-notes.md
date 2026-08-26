# askmycrawl — Architecture Notes (working draft)

> Status: raw capture of the design discussion, not the formal spec yet. This will be superseded/
> formalized in a later `docs/specs/` pass once each service is actually built.

## 1. Product shape

- Multi-user, role-based app: **admin** and **user**.
  - Users self-register. Passwords stored as **salt + pepper + SHA-256** (per spec — see `docs/specs/auth.md`).
  - **Admin**: list/update/delete any user, view all requests and all results across all users.
  - **User**: can only view/update their own requests and results.
- Core action: user submits a **URL + a question/query**. Crawling happens in the background — the
  user can navigate away and come back.
- Crawl depth is capped at **3**.
- On completion the user is notified three ways: **email**, **SMS**, and **Telegram** — Telegram
  confirmed as a Telegram Bot API chat message to the user's linked chat ID, a channel distinct from
  carrier SMS.
- Frontend also gets a **live update** (WebSocket) so the answer shows up in the UI tab without a
  refresh, in addition to the email/SMS/Telegram notifications.

## 2. Language — decided: NestJS (Node.js/TypeScript), all services

One runtime/language across the whole backend, including the LangChain-heavy services (Scraper's
crawl-clean step, the Indexer's chunk/embed step, Query/Answer's RAG step) — using `langchain.js`
there. (Names as of the 2026-08-26 Scraper/Indexer design, §5 below — this paragraph predates it.)

Why NestJS specifically (not just "Node"):
- `@nestjs/microservices` has built-in Kafka support (on kafkajs) — each backend service can be a
  Nest microservice app with `@EventPattern(...)`/`@MessagePattern(...)` handlers on the shared
  Kafka topics (`docs/specs/event-schemas.md`).
- `@nestjs/websockets` covers the Gateway's "hold an open WS per user, push live results" requirement.
- Guards map cleanly onto "Gateway validates token, routes to Auth Service if invalid."
- DI + module structure gives every service (Gateway, Auth, Scraper, Indexer, Query/Answer,
  Notification, Job Manager Service) the same consistent shape.

Trade-off accepted: `langchain.js` is less mature than Python's `langchain` (fewer integrations,
smaller community) — acceptable in exchange for one language/runtime/deploy pipeline across all
services instead of splitting the stack.

## 3. Flags / open items (not blocking, noted for the spec pass)

- **Password hashing**: salted+peppered SHA-256 is fast to brute-force compared to a deliberately
  slow KDF (bcrypt/scrypt/argon2), since SHA-256 has no work factor. Keeping as specified for now;
  worth a conscious yes/no when we write the auth spec.

- **Job creation decoupled from a synchronous Gateway→Job Manager Service call, 2026-08-25**
  (`docs/specs/services.md`, `event-schemas.md`, `api-contracts.md`) — the user's own words: "i
  dont like it that the gateway calls the result manager directly." Instead:

  1. Gateway publishes a `job-requests` Kafka message (`{ user_id, url, query }` — no `job_id`,
     none exists yet) and responds `202 { status: "accepted" }` immediately. No internal call to
     Job Manager Service on this path.
  2. Job Manager Service consumes `job-requests`, creates the `jobs` row (Postgres
     `gen_random_uuid()`), then publishes the seed `crawl-frontier` message, then publishes a new
     `job-created` message so the frontend can learn the real `job_id`.
  3. Gateway consumes `job-created` the same way it already consumes `result-saved` — look up the
     user's WebSocket connection, push `{ type: "job.created", job_id, seed_url, query, status }`.
     A disconnected client just sees the job on its next `GET /jobs` instead — same known gap
     `result-saved`'s relay already has.

  **Why**: the write path was the one place Gateway synchronously depended on a downstream
  service's availability to answer an HTTP request, while every later stage of the same pipeline
  is already event-driven. This makes job creation consistent with that shape instead of a
  synchronous exception, and means Job Manager Service being down no longer makes `POST /jobs`
  itself fail — the request just queues. Reads (`GET /jobs*`) are unaffected — still a synchronous
  internal call, since decoupling a read buys nothing and would just add latency for no reason.
  Trade-off, stated plainly: `POST /jobs`'s `202` response can no longer hand back a `job_id`
  (Gateway doesn't have one yet), so the frontend now depends on the WebSocket relay (or a later
  `GET /jobs` poll) to learn it — there's no synchronous fallback for a client that submits a job
  and immediately disconnects.

## 4. Crawl Worker — reverted, 2026-08-25 (not built, starting over deliberately)

A full Crawl Worker implementation (BFS pipeline, Redis-backed coordination — visited set,
fan-in/fan-out completion counter, global content-freshness cache, retry tracking, cooldown
marker — plus a stuck-job reconciliation sweep, a per-domain rate limiter, same-domain-only
crawling, and a consolidation pass merging five Redis interfaces into one) was built, then
**deliberately removed in full**, in the user's own words: "i feel like we are attomicly locking
the redis too much. i dont think we are using or planing it currectly... lets stop i made the
crawler to complix for me. i want to slowly build it up."

**What was removed**: `backend/apps/crawl-worker` in its entirety — the Nest app, every
Application/Infrastructure class, every unit and e2e test, its Dockerfile, its `devops/crawl-worker/`
service definition, the `devops/redis/` service it exclusively used (nothing else in this repo
touches Redis), its Grafana dashboard, and every doc describing its internal design (this file's
former §2 "Low-level pipeline" and §3 "Redis — decided design" sections, `docs/diagrams/crawl-worker/`,
and `docs/planning/03-crawl-coordination-hardening.md`).

**What survives**: `backend/libs/kafka-contracts` — the shared topic-name constants and typed
Kafka payload shapes (`crawl-frontier`, `crawl-complete`) — and the `kafka` broker/topic-init/UI
services in `devops/kafka/docker-compose.yml`. Nothing currently produces or consumes those topics;
they exist as the agreed wire contract for whatever gets built next. `docs/specs/services.md`'s
Crawl Worker section is back to a **not yet built** stub, matching every other not-yet-built
service.

**Why a full removal instead of another simplification pass**: earlier the same day, two
individual pieces (the reconciliation sweep, the rate limiter) were removed for feeling like
premature complexity, and the remaining Redis-touching interfaces were mid-consolidation into one
`ICrawlCoordinationStore` to cut `CrawlUrlService`'s dependency count. The user's read, after
sitting with all of that: the coordination model itself — several small atomic Redis operations
spread through one service — still felt like more locking/plumbing than they wanted to reason
about at once, regardless of how the interfaces were packaged. Rather than keep trimming an
architecture that no longer felt right, the call was to stop, clear the slate, and rebuild the
crawler incrementally from nothing — one piece at a time, each one earning its place, instead of
inheriting a design that was arrived at in one large pass. A master-worker (single coordinator +
dumb workers) redesign was also discussed and explicitly **not** chosen — see the git history of
this file for that reasoning if it comes up again — but a full "start over" ended up being the
actual decision instead of either "consolidate" or "centralize."

**Possible next direction, not yet decided** *(superseded below — kept for the historical record of
how the thinking evolved)*: splitting what used to be one "Crawl Worker" service into **two
separate services — a crawler and a scraper** — instead of rebuilding it as a single combined
worker again. Raised the same day, framed explicitly as tentative: "im planing to maybe change the
logic fully and siplit the worker to 2 projects types crawlers and scrapers." Nothing about this
split is designed yet — not the division of responsibility between the two (does the crawler own
link discovery and hand raw HTML to the scraper, or does the scraper also decide what's worth
following further?), not whether they'd talk over Kafka or a direct internal call, not whether both
need their own Postgres-adjacent state or neither does. Every doc that used to name "Crawl Worker"
as the one service has been reworded to describe the requirement (crawl + scrape a job's pages,
BFS-expand up to depth 3) without presuming a one-service or two-service shape — treat any
lingering "Crawl Worker" reference elsewhere as stale, not as settled architecture, and fix it the
same way rather than resurrecting the name.

## 5. Crawler/Scraper/Indexing — designed, 2026-08-26

The "not yet decided" split above is now decided, and it isn't a "crawler + scraper" split after
all — it's **Scraper** (fetch + BFS-expand) and **Indexer** (clean + chunk + embed + store), full
design in [`03-crawler-scraper-indexing-plan.md`](03-crawler-scraper-indexing-plan.md), formalized
from the user's own `plan.md` (v4 draft, kept at the repo root as the original source — the user
wrote it directly, iterating through v1–v4 across several rounds of their own comments before
asking for it to be formalized into the docs). Headline points, full detail in that file:

- **Redis is back** (removed in full in §4 above), but scoped much narrower than the reverted
  design: no global content-freshness cache, no per-domain rate limiter, no reconciliation sweep —
  just a per-`job_id` dedup set, two pending-work counters, and a `SET NX` race guard for
  completion. **BullMQ** (Redis-backed) now owns retry/backoff for both the scrape and index
  stages, instead of hand-rolled Kafka retry/DLQ topics — this is the piece that was missing before
  and made the original design feel like it was "atomically locking Redis too much": BullMQ absorbs
  the retry/failure bookkeeping that used to be bespoke Redis operations.
- **Storage moved off Postgres entirely for this slice**: raw HTML → **SeaweedFS** (self-hosted,
  S3-compatible blob store), embeddings → **Milvus** (self-hosted vector DB), replacing the
  Postgres+pgvector `pages`/`page_chunks`/`job_pages` design in `data-model.md`. "Search Result
  Manager" is renamed **Indexer** to match — it no longer manages anything in Postgres.
- **Embedding model is self-hosted via LM Studio** (OpenAI-compatible local API,
  `OpenAIEmbeddings` from `@langchain/openai`) — resolves the "embedding provider" item that used
  to be open in `docs/specs/README.md`; the LLM *answer-generation* provider (Query/Answer Service)
  is a separate, still-open decision.
- A new Kafka topic, `page-scraped`, bridges Scraper → Indexer (Kafka → BullMQ, same bridge pattern
  on both sides — this is why the two services mirror each other structurally).
- `crawl-complete`'s payload grew from a thin `{job_id, user_id, query}` trigger into a real result
  summary (`succeeded_count`/`failed_count`/`succeeded_urls`/`failed_urls`) — it now carries enough
  for Query/Answer Service to act without a callback.

See the new plan doc for the full mechanism (Frontier Consumer dedup, Scraper Worker steps,
Index Intake Consumer, Indexing Worker steps, completion detection, Redis key table, open items).

**Same day, follow-up: Job Manager Service's `jobs` table simplified too.** The first pass of the
plan doc above treated the job-creating service upstream of `crawl-frontier` ("external seed
producer" in the user's own `plan.md` diagram) as an opaque, out-of-scope box — the user flagged
that as a real omission, not just a scoping choice: it's `docs/specs/services.md`'s already-existing
Job Manager Service, ours to build, and deserved a proper write-up. While fixing that, the user
also simplified its schema directly: "the client only pushs to kafka a query, his id and the base
url — we will save those 3 columns in a table for jobs and we will have a job index that gets
generated a uuid and a result col that is empty at the start — in the end after we generated an
answer we will put it in the col." One `jobs` table now: `id` (generated), `user_id`, `url`,
`query`, `result` (`NULL` until answered). No `status` enum, no `depth_limit` (max depth is a fixed
constant used only by the Scraper), no `error_message`, no timestamps, no separate `results` table
— see `docs/specs/data-model.md`'s `jobs` table note for the full list of what this drops and the
real gap it leaves (a failed job has no representation at all, just stays `NULL` forever).

# askmycrawl — Architecture Notes (working draft)

> Status: raw capture of the design discussion, not the formal spec yet. This will be superseded/
> formalized in a later `docs/specs/` pass once Redis strategy + backend language are decided.

## 1. Product shape

- Multi-user, role-based app: **admin** and **user**.
  - Users self-register. Passwords stored as **salt + pepper + SHA-256** (per spec — see note in §5).
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

## 2. Low-level pipeline (as described)

```
Client
  │  POST /crawl { url, query }  (with auth token)
  ▼
Gateway
  │  validates token
  │  ├─ invalid/missing → Auth Service (Postgres-backed) → issue/refresh/reject
  │  └─ valid ─────────────────────────────────────────────┐
  ▼                                                          │
Kafka: crawl-frontier topic  ◄── seed message { job_id, user_id, url, query, depth: 3 }
  │
  ▼
Crawl Worker (pool, many instances)
  1. pop { job_id, url, depth } from topic   (depth is always >= 1 — see §3, depth-0 is never enqueued)
  2. Redis: SADD job:{job_id}:visited <url_hash>
       returns 0 → someone in THIS job already claimed this URL → DECR pending, done
       returns 1 → this worker owns it for this job, continue
  3. Redis: SET page:{url_hash} <job_id> NX EX 259200   (3-day global content cache, §3)
       fails (key exists) → content already fresh from *any* job's crawl in the last 3 days:
         skip fetch/scrape/embed, read the existing Postgres `pages` row for its content id
         and its stored outbound-link list (needed to keep expanding THIS job's BFS)
       succeeds → this worker does the real crawl:
         fetch page, extract all links, strip HTML/boilerplate via LangChain → clean text,
         hand clean text to the Search Result Manager (embeds + upserts the `pages` row,
         including the extracted link list, keyed by normalized URL)
  4. insert a `job_pages (job_id, page_id)` row — associates this content with this job's
     answer corpus, whether it was freshly scraped or reused from cache
  5. for each outbound link found (fresh or cached) with depth - 1 >= 1:
       Redis INCR job:{job_id}:pending  (before producing — see §3)
       produce { job_id, user_id, url: link, depth: depth - 1 } back onto the SAME topic
     links that would land at depth 0 are discarded — never enqueued, never counted
  6. Redis DECR job:{job_id}:pending
       if result == 0 → this was the last outstanding URL for the job → publish job-complete
  ▼
Search Result Manager
  - generates embeddings, stores vectors + outbound links in Postgres + pgvector
  ▼
Once a worker's DECR (step 6 above) hits zero, that worker publishes a "job complete" event
  ▼
Kafka: crawl-complete topic
  │
  ▼
Query/Answer Service (separate consumer)
  1. on job-complete event, ask Search Result Manager for the chunks relevant to the job's query
     (vector similarity search, scoped to this job's crawled pages)
  2. pass relevant chunks + query to an LLM → generate answer
  3. hand { user, answer } to the Notification Service
  ▼
Notification Service        Crawl Result Manager
  - email                     - persists the answer + metadata to Postgres
  - SMS                       - notifies the Gateway a result is ready for this user
  - Telegram
                               ▼
                          Gateway (holds open WebSocket per logged-in user)
                               - pushes the result to that user's UI in real time
```

## 3. Redis — decided design

Redis does three jobs here:

**a) Per-job visited/claim set (required, prevents cycles within one job's BFS)**
- `job:{job_id}:visited` → Redis Set of normalized-URL hashes.
- `SADD job:{job_id}:visited <url_hash>` — atomic; `1` = this worker claims it, `0` = already
  claimed within this job, skip.
- URL normalization (lowercase scheme+host, strip fragment/trailing slash/default port, sort query
  params) happens before hashing — required for dedup to mean anything.
- TTL ~24–48h as a cleanup safety net; explicitly deleted when the job completes.

**b) Global 3-day content cache (decided: build now, not deferred)**
- `page:{url_hash}` → `SET NX EX 259200` (3 days). Global — shared across every user's jobs.
- Claim succeeds → this worker does the real fetch/scrape/LangChain-clean/embed, and upserts the
  Postgres `pages` row (content + embeddings + **extracted outbound links**) keyed by normalized URL.
- Claim fails (key exists) → some job scraped this URL within the last 3 days; skip re-scraping
  entirely, reuse the existing `pages` row's embeddings **and its stored link list** (needed so this
  job's BFS can still keep expanding past a cached page).
- After 3 days the key expires; the next job to hit that URL re-scrapes it and the `pages` row (and
  its embeddings) get overwritten with the fresh version.
- A `job_pages (job_id, page_id)` join table records which pages belong to which job's answer corpus
  — this is what keeps a job's RAG query scoped to only *its* crawl, even though content is shared
  globally.
- Known v1 edge case, not solved yet: the Redis key is set at claim time, before the Postgres
  upsert finishes — a different job could theoretically see "cached" a moment before the row exists.
  Acceptable for now; revisit if it actually causes missing content at query time.

**c) Fan-out/fan-in completion counter (required — this is how a worker knows it's *last*)**
- `job:{job_id}:pending` → Redis integer counter.
- `INCR` once per child URL, **before** that child's message is produced to Kafka — and only for
  children that will actually be processed (depth − 1 ≥ 1; depth-0 children are discarded, see §2
  and the decision below, so they never touch the counter at all).
- `DECR` once a worker fully finishes a URL (cache hit or miss, claimed-and-processed or
  skipped-as-duplicate, success or failure all count as "finished").
- The atomic return value of `DECR` tells a worker whether it just hit zero — no separate GET/check,
  so no race on who fires the completion event.
- A worker must finish `INCR`-ing for *all* of a page's children before it `DECR`s for itself, or the
  counter could transiently hit zero mid-expansion.

**Depth-0 decision:** discarded entirely, not scraped. A URL is only ever enqueued (and thus only
ever scraped) if its depth is ≥ 1. With `MAX_DEPTH = 3`, a URL actually gets processed at depth
3, 2, or 1 — three levels of content — and links discovered at depth 1 (which would be depth 0) are
dropped at discovery time rather than being enqueued and then thrown away.

## 4. Language — decided: NestJS (Node.js/TypeScript), all services

One runtime/language across the whole backend, including the LangChain-heavy services (crawl-clean,
Search Result Manager vectorization, Query/Answer RAG step) — using `langchain.js` there.

Why NestJS specifically (not just "Node"):
- `@nestjs/microservices` has built-in Kafka support (on kafkajs) — each backend service can be a
  Nest microservice app with `@EventPattern(...)`/`@MessagePattern(...)` handlers on the shared
  `crawl-frontier` / `crawl-complete` topics, matching §2's pipeline directly.
- `@nestjs/websockets` covers the Gateway's "hold an open WS per user, push live results" requirement.
- Guards map cleanly onto "Gateway validates token, routes to Auth Service if invalid."
- DI + module structure gives every service (Gateway, Auth, Crawl Worker, Search Result Manager,
  Query/Answer, Notification, Crawl Result Manager) the same consistent shape.

Trade-off accepted: `langchain.js` is less mature than Python's `langchain` (fewer integrations,
smaller community) — acceptable in exchange for one language/runtime/deploy pipeline across all
services instead of splitting the stack.

## 5. Flags / open items (not blocking, noted for the spec pass)

- **Password hashing**: salted+peppered SHA-256 is fast to brute-force compared to a deliberately
  slow KDF (bcrypt/scrypt/argon2), since SHA-256 has no work factor. Keeping as specified for now;
  worth a conscious yes/no when we write the auth spec.
- **URL normalization**: rule set named in §3 (lowercase scheme/host, strip fragment/trailing
  slash/default port, sort query params) — still need to decide on edge cases like tracking params
  (`utm_*`) and whether to follow redirects before normalizing.
- **Politeness / robots.txt / per-domain rate limiting**: not mentioned yet, flagging as a likely
  concern once we're crawling depth-3 trees for real; can be scoped in or explicitly out later.
- **Retry / dead-letter handling** for failed fetches: not yet defined; affects the completion
  counter (a failed URL still needs to "count" as done, or the job never completes).

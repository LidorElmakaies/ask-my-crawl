# Event Schemas (Kafka)

All services connect via `@nestjs/microservices`' Kafka transporter (kafkajs underneath). Partition
key is noted per topic — job coordination correctness is a concern for whatever consumes
`crawl-frontier` to decide, not something Kafka ordering provides, so partition keys below are
chosen for even load distribution, not ordering guarantees.

## `job-requests`

**Implemented.** Fires from Gateway on `POST /jobs`, before any job row exists — Gateway does not
call Job Manager Service synchronously to create the job row. It publishes this message and
responds `202` immediately, with no `job_id` yet (Gateway doesn't have one to give). See
`job-created` below for how the frontend eventually learns the real `job_id`.

- **Producers**: Gateway
- **Consumers**: Job Manager Service, consumer group `job-manager`
- **Partition key**: `user_id`
- **Value**:
  ```jsonc
  {
    "user_id": "uuid",
    "url": "https://example.com",   // Gateway does not normalize this — whatever consumes crawl-frontier does, on receipt
    "query": "the user's question"
  }
  ```
  These exact 3 fields become the `jobs` row's `user_id`/`url`/`query` columns verbatim —
  Job Manager Service adds only `id` (generated) and `result` (`NULL` at first). See
  `data-model.md`'s `jobs` table.

## `crawl-frontier`

**Implemented.** Full mechanism: `docs/planning/03-crawler-scraper-indexing-plan.md`. The BFS work
queue for the Scraper service — both the initial seed URL and every subsequently-discovered URL on
one topic (the seed producer and the Scraper both publish onto it).

- **Producers**: Job Manager Service (seed message, on consuming `job-requests`); the Scraper's
  Scraper Worker also re-produces child-URL messages back onto it
- **Consumers**: the Scraper's Frontier Consumer, consumer group `scraper` (owns per-job dedup —
  see the planning doc; this is the single authoritative gate, so redelivery of the same message is
  harmless)
- **Partition key**: `url_hash` (spreads load evenly; no consumer needs messages for the same job
  co-located)
- **Value**:
  ```jsonc
  {
    "job_id": "uuid",
    "user_id": "uuid",
    "url": "https://example.com/page",   // not yet normalized — the consumer normalizes on receipt
    "depth": 3,                           // remaining-hops budget, NOT an absolute depth — starts at
                                           // MAX_CRAWL_DEPTH (currently 3, see @app/kafka-contracts)
                                           // on the seed message and counts DOWN by 1 per hop; the
                                           // Scraper stops re-publishing once depth reaches 0
                                           // (see data-model.md)
    "query": "the user's original question",
    "base_url": "https://example.com"     // the job's seed URL — equals `url` on the seed message
                                           // itself, propagated through unchanged on every child
  }
  ```
  Both `query` and `base_url` are propagate-only fields: `crawl-complete` (below) needs the job's
  query and its seed URL, and the Scraper needs the seed URL to enforce the same-domain link
  filter against the site the job actually started at (not whichever page a link happened to be
  found on). Rather than have whatever consumes `crawl-frontier` call Job Manager Service
  synchronously just to fetch either, or store them separately in Redis, the seed producer (Job
  Manager Service) sets both once (`base_url` equal to that same seed message's own `url`), and
  every re-produced child message is expected to copy them through unchanged.

## `job-created`

**Implemented.** Fires from Job Manager Service once it has actually created the `jobs` row and
published the seed `crawl-frontier` message — this is how the frontend learns the real `job_id`
that `POST /jobs` couldn't return synchronously, since Gateway never has one (see `job-requests`
above).

- **Producers**: Job Manager Service
- **Consumers**: Gateway, consumer group `gateway`
- **Partition key**: `job_id`
- **Value**:
  ```jsonc
  {
    "job_id": "uuid",
    "user_id": "uuid",
    "url": "https://example.com",
    "query": "the user's question"
  }
  ```
  Matches the `jobs` row Job Manager Service creates (see `data-model.md`) minus `result` (still
  `NULL` at this point) — no `status` field, that column doesn't exist.
- Gateway behavior on receipt: same relay pattern as `result-saved` below — look up an active
  WebSocket connection for `user_id`, push a `job.created` event (see `api-contracts.md`'s
  WebSocket section) with this payload if connected. If the user isn't currently connected, no
  action needed — a subsequent `GET /jobs` will list the job once it exists, they just won't get
  the live "your job now has an id" push. (Same known gap as `result-saved`'s Notification Service
  fallback — not solved here, just restated: a disconnected client has no live channel, only poll.)

## `page-scraped`

**Implemented** (the producing side — the Scraper). Full mechanism: `docs/planning/
03-crawler-scraper-indexing-plan.md`. Fires from the Scraper Worker once a page's raw HTML is saved
to SeaweedFS. The consuming side (the Indexer's Index Intake Consumer, bridging into its
`index-page` BullMQ queue — Kafka→BullMQ bridge, mirroring `crawl-frontier`→`process-url`) is **not
implemented** — the Indexer doesn't exist yet.

- **Producers**: the Scraper's Scraper Worker(s)
- **Consumers**: the Indexer's Index Intake Consumer, consumer group `indexer` (not built yet)
- **Partition key**: `url_hash` — decided 2026-08-28, spreads Indexer load evenly across
  partitions; no per-job ordering is needed since each message indexes one independent page
- **Value**:
  ```jsonc
  {
    "job_id": "uuid",
    "user_id": "uuid",
    "url": "https://example.com/page",       // as discovered, not normalized
    "normalizedUrl": "string",                // normalized form — SeaweedFS blob key is sha256(this)
    "blobKey": "string",                      // sha256(normalizedUrl) — SeaweedFS object key
    "depth": 2,
    "scrapedAt": "ISO8601",
    "query": "the user's original question"   // propagate-only, same as on crawl-frontier
  }
  ```

## `crawl-complete`

**Implemented** (the producing side — the Scraper, currently always the one to win the race since
the Indexer doesn't exist yet). Full mechanism: `docs/planning/03-crawler-scraper-indexing-plan.md`.
Fires once a job's two Redis pending-work counters (`pending_scrape`, `pending_index`) both reach
zero — a `SET NX` race guard ensures exactly one producer per job. The payload is a full result
summary, so Query/Answer Service can act without a callback to fetch counts/URL lists separately —
verified live: a real crawl produced an accurate `succeeded_count`/`failed_count` split.

- **Producers**: the Scraper's Scraper Worker **or**, once built, the Indexer's Indexing Worker —
  whichever component's decrement observes both counters at zero and wins the race guard. Not
  always the same service for every job.
- **Consumers**: Query/Answer Service, consumer group `query-answer` (not implemented — nothing
  consumes this topic today, but it must still exist since `auto.create.topics.enable=false`)
- **Partition key**: `job_id`
- **Value**:
  ```jsonc
  {
    "job_id": "uuid",
    "user_id": "uuid",
    "query": "the user's original question",
    "url": "https://example.com",             // base_url — the original seed URL
    "succeeded_count": 12,
    "failed_count": 1,
    "succeeded_urls": ["https://example.com/a", "..."],
    "failed_urls": ["https://example.com/broken-page"]
  }
  ```
  Note for later, not a concern yet: at depth-3/single-domain scope the URL lists stay small; if
  that scope ever changes, they could move to a small object in SeaweedFS with just a pointer +
  the counts left in the event.

## `answer-ready`

**Implemented** (the consuming side — Job Manager Service). **Not implemented** (the producing
side — Query/Answer Service doesn't exist yet, so nothing publishes this topic in the live stack
today). It should fire once Query/Answer Service has run retrieval + the LLM call. Two independent
consumer groups read this topic in parallel — Kafka pub/sub, not point-to-point — since the answer
goes to both notification and persistence at the same stage.

- **Producers**: Query/Answer Service (not implemented — no producer exists yet)
- **Consumers**:
  - Notification Service, consumer group `notification-service` (not implemented)
  - Job Manager Service, consumer group `job-manager` (implemented — writes `jobs.result` and
    publishes `result-saved`, see `save-job-result.service.ts`)
- **Partition key**: `job_id`
- **Value**:
  ```jsonc
  {
    "job_id": "uuid",
    "user_id": "uuid",
    "answer_text": "string"
  }
  ```
  No `source_urls` field: Query/Answer Service runs retrieval against the Indexer internally to
  build the LLM prompt, but nothing carries that source list any further than this call — it isn't
  persisted or forwarded anywhere.

## `result-saved`

**Implemented.** Fires from Job Manager Service once it has written the answer into the
`jobs.result` column, so the Gateway can push the update to the user's open WebSocket connection.

- **Producers**: Job Manager Service
- **Consumers**: Gateway, consumer group `gateway`
- **Partition key**: `user_id`
- **Value**:
  ```jsonc
  {
    "job_id": "uuid",
    "user_id": "uuid",
    "result": "string"
  }
  ```
  No `completed_at` — the `jobs` table carries no timestamps, see `data-model.md`.
- Gateway behavior on receipt: look up an active WebSocket connection for `user_id` in its
  connection registry; if connected, push a `job.completed` event with this payload. If the user
  isn't currently connected, no action needed here — they still get email/SMS/Telegram, and will see
  the result via a normal `GET /jobs/:id` on next load (see api-contracts.md).

## Topic config (starting point, not final)

| Topic | Partitions | Retention |
|---|---|---|
| `job-requests` | 3 | 1 day |
| `crawl-frontier` | 6 | 1 day |
| `job-created` | 3 | 1 day |
| `page-scraped` | TBD | TBD |
| `crawl-complete` | 3 | 1 day |
| `answer-ready` | 3 | 1 day |
| `result-saved` | 3 | 1 day |

## BullMQ queues (not Kafka — noted here since they sit inline in the same pipeline)

The Scraper and Indexer each front their Kafka consumer with a BullMQ queue instead of a second
Kafka topic, so retries/failures are BullMQ's `attempts`/`backoff` rather than a hand-rolled Kafka
retry/DLQ topic. Full detail in `docs/planning/03-crawler-scraper-indexing-plan.md`.

| Queue | Producer | Worker | Backed by |
|---|---|---|---|
| `process-url` | Scraper's Frontier Consumer | Scraper Worker(s) | Redis (BullMQ) |
| `index-page` | Indexer's Index Intake Consumer | Indexing Worker(s) | Redis (BullMQ) |

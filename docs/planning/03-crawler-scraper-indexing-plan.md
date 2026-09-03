# Scraper / Indexer — Design

Full mechanism for the two services that turn a job's seed URL into indexed, searchable chunks: the
**Scraper** (§1–§6) and the **Indexer** (§7). Referenced from `services.md`, `data-model.md`,
`event-schemas.md`, and `backend-architecture.md` as "the full mechanism" for both.

Both are implemented and working end to end — a submitted job gets crawled, scraped, chunked,
embedded, and stored in Qdrant. What's still missing is Query/Answer Service reading it back out to
produce an answer (see `services.md`).

## 1. Shape

Two services, one Nest app each, mirroring each other structurally — both single-concern per
`backend-architecture.md`'s test (internally complex, but each is still one cohesive concern:
"fetch and BFS-expand a job's pages" / "clean, chunk, embed, and store a job's pages"), so both
stay **flat** at `src/{models,api,application,infrastructure}`, no extra nesting:

```
crawl-frontier (Kafka) ──▶ Frontier Consumer ──▶ process-url (BullMQ) ──▶ Scraper Worker(s)
     ▲                     [Scraper, API layer]                          [Scraper, API layer]
     │ re-published child URLs (depth-1)                                       │
     └─────────────────────────────────────────────────────────────────────────┤
                                                                                 │ page-scraped (Kafka)
                                                                                 ▼
                                                    Index Intake Consumer ──▶ index-page (BullMQ) ──▶ Indexing Worker(s)
                                                    [Indexer, API layer]                              [Indexer, API layer]
```

Neither service calls the other synchronously — bridged entirely by Kafka (`crawl-frontier`,
`page-scraped`) plus shared Redis coordination state (`data-model.md`'s "Redis" section). Kafka
producers and BullMQ enqueue calls are Infrastructure-layer everywhere (`IEventPublisher`,
`IProcessUrlQueue`/`IIndexPageQueue`); Kafka consumers and BullMQ workers are API-layer — per
`backend-architecture.md`, not re-litigated here.

**Deployment: both default to 2 replicas** (`deploy.replicas: 2` in `devops/scraper|indexer/
docker-compose.yml`, honored directly by `docker compose up`, no Swarm needed). Safe because
neither holds per-instance state — coordination lives in shared Redis — and neither has a `ports:`
or `container_name:` to collide. Raised from 1 alongside `MAX_CRAWL_DEPTH` going from 3 to 10 (a
deeper default crawl means more pages to fetch/chunk/embed per job).

## 2. URL handling

**No general URL normalization.** A different `?query=...` string can legitimately serve different
content, so query strings (and everything else about the URL — host casing, trailing slash) pass
through untouched; normalizing them would risk conflating genuinely different pages.

**Exception: the URL fragment (`#...`) is stripped**, and only the fragment. A fragment is never
sent to the server — `page.html#foo` and `page.html#bar` produce the byte-identical HTTP response —
so dropping it can't lose content, it only stops the same page being fetched/saved twice under two
URLs that were always going to return the same bytes.

```ts
function stripFragment(url: string): string {
  return url.split('#')[0];
}
```

This is the only transform applied before computing the BullMQ dedup `jobId`
(`sha256(job_id + ":" + url)`, see §4) and the SeaweedFS blob key (`sha256(stripFragment(url))`).

## 3. Same-domain link filter

"Same-domain" ignores a leading `www.` on either side of the comparison — `www.example.com` and
`example.com` are the same domain. No broader subdomain folding (`blog.example.com` is a
**different** domain from `example.com`).

```ts
function sameDomain(a: string, b: string): boolean {
  const norm = (h: string) => h.replace(/^www\./i, '').toLowerCase();
  return norm(a) === norm(b);
}
```

Compared against the seed URL's hostname, not the immediately-referring page's hostname, so the
crawl can't domain-hop through a same-domain chain onto somewhere the seed never pointed to it
either way. The seed's hostname is derived from `base_url`, a field on the `crawl-frontier` message
itself (§4) — not a separate Redis-stored copy.

## 4. Frontier Consumer

API layer, `@EventPattern('crawl-frontier')`, consumer group `scraper`. Consumes every message —
both the seed (Job Manager Service) and every child URL a Scraper Worker re-publishes.

**`base_url` is a propagate-only field on the message itself** — same pattern `query` already uses.
Job Manager Service sets it once on the seed `crawl-frontier` message, equal to that same message's
own `url` (the seed's own URL *is* the job's base URL). Every child message the Scraper Worker
re-publishes copies it through unchanged. Whatever needs the job's seed URL later (the same-domain
filter in §5c, the `crawl-complete` payload in §6) reads it straight off the message it's already
holding — no separate Redis-stored job-meta hash, no synchronous call back to Job Manager Service.

1. `stripFragment(url)`.
2. `queue.alreadyClaimed(job_id, url)` — checks whether a `process-url` BullMQ job already exists
   for this exact `(job_id, url)` pair (its `jobId` is `sha256(job_id + ":" + url)`, fixed rather
   than auto-generated). If it already exists — still queued/active, or completed/failed within
   the retention window — drop the message here, no further action.
3. If not already claimed: `SADD job:{job_id}:pending_scrape <url>`, then enqueue onto
   `process-url` (BullMQ, same fixed `jobId`) with `{job_id, user_id, url, depth, query,
   base_url}`.

**Why the dedup gate is the BullMQ job, not a separate `SADD ... visited` marker**: an earlier
version of this design used exactly that — `SADD crawl:{job_id}:visited <url>` first, then the
counter increment and enqueue. That marker is a real correctness hazard: if this consumer crashes
*after* the SADD succeeds but *before* the enqueue completes, the URL is permanently marked
"visited" but was never actually queued or counted. Kafka redelivers the message (at-least-once),
but the handler's very first move is checking that marker — sees it's already set, returns early,
and never finishes the claim. The marker doesn't just fail to help recovery, it actively blocks
it. Worse, if the crash lands after the counter increment specifically, `pending_scrape` can never
reach zero for that job — `crawl-complete` never fires, and the whole job (not just that one URL)
hangs forever with no notification and no automatic recovery.
Checking `queue.getJob()` instead of a separate marker avoids this because it asks about the
*actual* state (does the claim exist yet?) rather than a proxy for it recorded earlier — a retry
after a crash re-derives the true answer instead of trusting a marker that may have outlived the
work it was meant to gate. `pending_scrape` is a Set (member = "currently outstanding"), not a
counter, so add/remove are themselves idempotent under redelivery too — the full sequence (check →
add → enqueue) is safe to repeat from any crash point. The `jobId` must be scoped to
`job_id + url`, not the URL alone: `process-url` is one shared queue for the deployment's whole
lifetime, and BullMQ retains finished job records indefinitely unless told otherwise
(`removeOnComplete`/`removeOnFail`, bounded here to `JOB_KEY_TTL_SECONDS` — the same window the
Redis coordination keys use), so a URL-only id would make a URL scrapable at most once, ever,
across every future unrelated crawl job.

This consumer does no fetching and no domain filtering — same-domain/depth filtering already
happened upstream (Scraper Worker only re-publishes URLs that already passed both checks), so
Frontier Consumer's only job is dedup + counter + enqueue.

## 5. Scraper Worker(s)

BullMQ worker(s) on `process-url`. Also API layer (a worker's `process` function is an inbound
trigger, same as a Kafka consumer — see `backend-architecture.md`). Calls into one Application-layer
use case; the steps below are that use case's logic.

1. Fetch the URL over plain HTTP (`fetch`/axios — 30s timeout, no headless browser, no JS
   execution).
2. **On a transient failure** (timeout, connection error, or an HTTP 5xx response): let BullMQ
   retry, up to `SCRAPER_FETCH_MAX_ATTEMPTS` attempts (env-configurable, **default 3**), exponential
   backoff (base delay 5s). Only after the final attempt is exhausted does this count as a
   terminal failure.
3. **On a permanent failure** (any 4xx — 404, 410, 403, etc.): terminal immediately, **no retry**.
   Retrying a "this page doesn't exist" response wastes the attempt budget on something that will
   never succeed.
4. **Terminal failure (either kind)**: `SADD job:{job_id}:failed <url>`, `SREM`
   `job:{job_id}:pending_scrape <url>` (no completion check here — see §6), stop — no children
   expansion for a page that was never fetched.
5. **On success**, branch on the response's `Content-Type` — a switch/strategy dispatch, not an
   if/else, so adding a new content type later is one new case, not a rewrite:
   ```ts
   switch (contentTypeFamily(response.headers['content-type'])) {
     case 'html':
       return handleHtmlPage(url, response.body, ctx);   // implemented — steps below
     case 'pdf':
       return handleUnsupportedContentType(url, 'pdf', ctx);   // stub, not implemented — see below
     default:
       return handleUnsupportedContentType(url, 'unknown', ctx); // stub, not implemented
   }
   ```
   `handleUnsupportedContentType` is a **deliberate stub**: the extension point exists rather than
   hardcoding "only HTML exists," but its actual behavior (skip silently? save the raw blob anyway
   without indexing? mark failed?) isn't decided — implement it for real when a second content type
   is actually needed, don't leave the stub throwing in production.
6. `handleHtmlPage` (the only implemented branch):
   a. `blobKey = sha256(stripFragment(url))`; save the raw HTML body to SeaweedFS at that key.
      SeaweedFS's S3 API is wire-compatible with `@aws-sdk/client-s3`, so it's a config change (not
      a rewrite) to point the same adapter at real AWS S3 later.
   b. Parse the HTML, extract outbound `<a href>` links.
   c. Filter: same-domain only (§3, against the job's `base_domain`), and only if `depth - 1 > 0`
      i.e. don't bother producing children once the next hop would already be past the budget —
      children are re-published at `depth - 1`.
   d. For each surviving child link: publish `crawl-frontier` (`{job_id, user_id, url: child,
      depth: depth - 1, query, base_url}` — `base_url` copied through unchanged, see §4, partition
      key `url_hash` per `event-schemas.md`). No dedup check here — that's Frontier Consumer's job
      (§4) when it consumes this same message back.
   e. Publish `page-scraped` (`{job_id, user_id, url, normalizedUrl: stripFragment(url), blobKey,
      depth, scrapedAt, query, base_url}`, partition key `url_hash` — spreads Indexer load evenly
      across partitions; no per-job ordering is needed since each message indexes one independent
      page). `base_url` rides this message too, same reasoning as §4 — `crawl-complete`'s `url`
      field must always mean the job's seed URL, and the Indexer is the one that eventually
      publishes it.
   f. `SADD job:{job_id}:succeeded <url>`, `SREM job:{job_id}:pending_scrape <url>` (no completion
      check here — see §6).

## 6. Completion detection

**Only the Indexer's Indexing Worker checks for job completion or publishes `crawl-complete`** — the
Scraper's own `SREM` (§5 step 4/6f) never checks `pending_index` or checks for completion at all.
This is necessary, not just simpler: `page-scraped`'s delivery from the Scraper to the Indexer is
asynchronous (produce now, consumed whenever the Indexer's Kafka consumer gets to it), so a
Scraper-side completion check could observe `pending_index` as 0 simply because the Indexer hasn't
incremented it yet for that page, not because indexing is actually done — for a single-page job
(depth 1, no child links), with no other scrape work to provide a buffer, that would fire
`crawl-complete` before the page is even queued for indexing. The job isn't done until it's actually
indexed and searchable, not merely scraped, so only the side that knows indexing is finished may
declare completion.

After an Indexing Worker finishes its own step (§7) and removes the page from `pending_index`, it
checks:

```ts
if (SCARD(pending_scrape) === 0 && SCARD(pending_index) === 0) {
  const wonRace = await redis.set(`job:${job_id}:notified`, '1', { NX: true });
  if (wonRace) {
    // publish crawl-complete — build the payload from job:{job_id}:succeeded / :failed
  }
}
```

`SET NX` still guards exactly-once delivery even with a single caller: two different Indexing
Worker calls could still both observe zero-zero for the same job in the narrow window between one
finishing its `SREM` and reading these two cardinalities (e.g. two different pages of the same job
finishing indexing back-to-back). Only the one that wins the `SET` publishes `crawl-complete`. The
winner reads `job:{job_id}:succeeded`/`:failed` (Sets) to build the full payload:

```jsonc
{
  "job_id": "uuid",
  "user_id": "uuid",
  "query": "...",
  "url": "...",              // base_url, straight off the message that triggered this call
  "succeeded_count": 12,
  "failed_count": 1,
  "succeeded_urls": ["..."],
  "failed_urls": ["..."]
}
```

matching `event-schemas.md`'s `crawl-complete` shape. After publishing, `EXPIRE` every
`job:{job_id}:*` key with a ~1 hour TTL (not an immediate `DEL`) — leaves a short post-completion
inspection window, no indefinite growth.

## 7. Indexer

Mirrors the Scraper's shape, per this file's own §1 diagram and Redis coordination state.

- **Index Intake Consumer** (API layer) — consumes `page-scraped`, bridges each message onto
  `index-page` (BullMQ), same Kafka→BullMQ bridge pattern as the Frontier Consumer, same dedup gate
  too: `queue.alreadyClaimed(job_id, normalizedUrl)` (backed by an `index-page` job whose `jobId`
  is fixed per `job_id`+`normalizedUrl`) before `SADD job:{job_id}:pending_index <url>` and enqueue.
  Unlike `crawl-frontier`'s messages, a `page-scraped` message is never a legitimate rediscovery of
  an already-seen URL — the gate here exists purely to absorb Kafka's at-least-once redelivery and
  crash-mid-handler retries, both of which used to double-count `pending_index` (previously called
  out as a known, accepted POC-level gap; the same BullMQ-jobId mechanism that fixes the Scraper's
  crash-window bug in §4 closes this one too, as a side effect).
- **Indexing Worker(s)** (API layer, BullMQ workers on `index-page`) — fetch the raw HTML blob from
  SeaweedFS by `blobKey`, strip it to plain text (`cheerio`), chunk it
  (`RecursiveCharacterTextSplitter` from `@langchain/textsplitters`, 1000/200 size/overlap — an
  unremarkable starting point, not tuned against real answer quality yet), embed it (any
  OpenAI-compatible embedding server via `OpenAIEmbeddings` from `@langchain/openai`, currently a
  self-hosted LM Studio instance — swappable via `EMBEDDING_BASE_URL`, no code change), delete any
  stale vectors for that `url` from Qdrant, upsert the new chunks. Then `SREM`
  `job:{job_id}:pending_index <url>` and run the same completion check (§6) — using its own scoped
  copy of the Redis coordination logic, not the Scraper's (see `data-model.md`'s Redis section for
  why these stay independent copies).
- **Qdrant collection schema**: 768-dim vector field (`text-embedding-nomic-embed-text-v1.5` by
  default, both env-configurable), `HNSW`/`COSINE` index (built automatically as part of collection
  creation), payload fields `job_id`/`user_id`/`url`/`query`/`chunk_index`/`scraped_at`/`text` (the
  chunk's own content — Query/Answer Service needs the real text back from a similarity search, not
  just a vector). Point IDs are a fresh `randomUUID()` per chunk on every upsert (Qdrant rejects
  arbitrary strings — a uint64 or a valid UUID only); stable IDs across re-indexes aren't needed
  since delete-by-`url` always runs first. Full detail: `data-model.md`.
- **Vector DB is Qdrant** — single container, no external metadata/object-storage dependency
  (originally built against Milvus, which genuinely needs its own etcd+MinIO; replaced once that
  topology proved unwarranted for this project's scale). `IVectorStore` is an interface
  (`backend-architecture.md`'s layering), so a future swap would touch only the one Infrastructure
  adapter. The official `qdrant/qdrant` image deliberately ships without `curl`/`wget` (a security
  choice upstream — `github.com/qdrant/qdrant/issues/4250`), so its Docker healthcheck uses a
  `/dev/tcp` bash redirection instead — Qdrant's own reference compose file uses the identical
  command.
- **A real integration quirk to know about before touching this code**: LM Studio's
  `/v1/embeddings` endpoint silently returns a truncated vector (192 values instead of 768) when
  asked for `encoding_format: "base64"` — the `openai` SDK's own default request shape — instead of
  erroring. Forcing `encodingFormat: 'float'` on `OpenAIEmbeddings`'s constructor bypasses the broken
  path entirely; fixed in `apps/indexer/src/infrastructure/langchain/openai-embedding.client.ts`.
- **Retry policy for the index stage**: `INDEXER_MAX_ATTEMPTS` (default 3), same exponential-backoff
  shape as the Scraper's `SCRAPER_FETCH_MAX_ATTEMPTS`. Permanent vs. transient classification: a
  missing blob, unparseable HTML, or a persistent embedding-dimension mismatch are permanent
  (`PermanentIndexError` → BullMQ's `UnrecoverableError`, no retry); a SeaweedFS/LM Studio/Qdrant
  connection failure is transient (plain `Error`, retried).
- **Still not designed**: the Query/Answer retrieval API (a Qdrant similarity search scoped to a
  `job_id`) — see `data-model.md` and `services.md`'s Indexer section.

## 8. Open items (not blocking, not decided)

- `handleUnsupportedContentType`'s real behavior (§5 step 5) — implemented as a deliberate stub,
  throws `PermanentFetchError('... not implemented')`. Still not decided what it should actually do.
- Per-domain rate limiting — not implemented, not even a stub/interface.

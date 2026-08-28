# Scraper / Indexer — Design Plan

> Status: reconstructed 2026-08-28. Every other spec (`services.md`, `data-model.md`,
> `event-schemas.md`, `backend-architecture.md`, the `devops` agent) has pointed at this file as
> "the full mechanism" since 2026-08-26, but it never actually got written/committed — this is that
> doc, assembled from the consistent fragments scattered across those files plus a round of open
> decisions closed out directly with the user on 2026-08-28. Referenced from
> [`01-architecture-notes.md` §5](01-architecture-notes.md).
>
> **Build scope for this pass was Scraper only** (§1–§6 below) — **implemented and verified
> 2026-08-28** (`backend/apps/scraper`): a real crawl of `info.cern.ch` produced 24 succeeded pages
> (real blobs in SeaweedFS, real `page-scraped` messages), 1 correctly-classified permanent failure
> (404, no wasted retries), and a real `crawl-complete` summary; a separate test against an
> unreachable host confirmed the transient-failure path genuinely retries
> `SCRAPER_FETCH_MAX_ATTEMPTS` times before giving up. The Indexer (§7) is documented here in full
> because it's the other half of the shared Redis/completion-detection design and every other spec
> already points at this file for it too — but it is **still not implemented**. Don't start Indexer
> code from this doc without confirming scope has actually expanded.

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

## 2. URL handling — decided 2026-08-28

**No general URL normalization.** An earlier draft of this doc proposed stripping query strings —
rejected directly: *"i dont think i need to normalize it... it was to remove ?... and #.... but
its incorrect it makes my crawl less currect"* — a different `?query=...` string can legitimately
serve different content, so stripping it would cause the crawler to conflate genuinely different
pages.

**Exception: the URL fragment (`#...`) is stripped**, and only the fragment. A fragment is never
sent to the server — `page.html#foo` and `page.html#bar` produce the byte-identical HTTP response —
so dropping it can't lose content, it only stops the same page being fetched/saved twice under two
URLs that were always going to return the same bytes.

```ts
function stripFragment(url: string): string {
  return url.split('#')[0];
}
```

This is the only transform applied before:
- computing the Redis dedup key (`SADD crawl:{job_id}:visited`)
- computing the SeaweedFS blob key (`sha256(stripFragment(url))`)

Everything else about the URL string (query params, host casing, trailing slash) passes through
untouched.

## 3. Same-domain link filter — decided 2026-08-28

"Same-domain" ignores a leading `www.` on either side of the comparison — `www.example.com` and
`example.com` are the same domain. No broader subdomain folding (`blog.example.com` is a
**different** domain from `example.com`) — narrowest change from plain hostname matching, decided
directly over the alternative (any-subdomain-counts-as-same-site).

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
2. `SADD crawl:{job_id}:visited <url>` — Redis `SADD` returns whether the member was newly added;
   this single atomic op **is** the dedup gate. If it was already a member, drop the message here,
   no further action — this makes redelivery of the same message (Kafka at-least-once, a retry,
   whatever) harmless.
3. If newly added: `INCR job:{job_id}:pending_scrape`, then enqueue onto `process-url` (BullMQ)
   with `{job_id, user_id, url, depth, query, base_url}`.

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
4. **Terminal failure (either kind)**: `SADD job:{job_id}:failed <url>`, decrement
   `job:{job_id}:pending_scrape`, run completion check (§6), stop — no children expansion for a
   page that was never fetched.
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
   `handleUnsupportedContentType` is a **deliberate stub** for now — decided 2026-08-28 to leave the
   extension point in place rather than hardcode "only HTML exists." Its actual behavior (skip
   silently? save the raw blob anyway without indexing? mark failed?) is not decided — when a real
   need for a second content type shows up, implement it there and update this doc, don't leave the
   stub throwing in production.
6. `handleHtmlPage` (the only implemented branch):
   a. `blobKey = sha256(stripFragment(url))`; save the raw HTML body to SeaweedFS at that key
      (bucket/access details: §8).
   b. Parse the HTML, extract outbound `<a href>` links.
   c. Filter: same-domain only (§3, against the job's `base_domain`), and only if `depth - 1 > 0`
      i.e. don't bother producing children once the next hop would already be past the budget —
      children are re-published at `depth - 1`.
   d. For each surviving child link: publish `crawl-frontier` (`{job_id, user_id, url: child,
      depth: depth - 1, query, base_url}` — `base_url` copied through unchanged, see §4, partition
      key `url_hash` per `event-schemas.md`). No dedup check here — that's Frontier Consumer's job
      (§4) when it consumes this same message back.
   e. Publish `page-scraped` (`{job_id, user_id, url, normalizedUrl: stripFragment(url), blobKey,
      depth, scrapedAt, query}`, partition key `url_hash` — decided 2026-08-28, spreads Indexer
      load evenly across partitions; no per-job ordering is needed since each message indexes one
      independent page).
   f. `SADD job:{job_id}:succeeded <url>`, decrement `job:{job_id}:pending_scrape`, run completion
      check (§6).

## 6. Completion detection

After **either** side (a Scraper Worker finishing §5, or an Indexer Indexing Worker finishing its
own equivalent step — §7) decrements its own pending counter, it checks:

```ts
if (pending_scrape === 0 && pending_index === 0) {
  const wonRace = await redis.set(`job:${job_id}:notified`, '1', { NX: true });
  if (wonRace) {
    // this component (whichever one observed the zero-zero state and won the SET NX) publishes
    // crawl-complete — build the payload from job:{job_id}:succeeded / :failed
  }
}
```

`SET NX` is the exactly-once guard — both a Scraper Worker and an Indexing Worker could observe
zero-zero for the same job at nearly the same moment (a job's last page finishes scraping and
indexing close together), only one of them wins the `SET`, only that one publishes `crawl-complete`.
The winner reads `job:{job_id}:succeeded`/`:failed` (Sets) to build the full payload:

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

## 7. Indexer (design carried over, not being built this pass)

Mirrors the Scraper's shape — documented here since it shares this file, this pipeline's Kafka
topics, and the Redis coordination state, but **out of scope for the current implementation pass**.

- **Index Intake Consumer** (API layer) — consumes `page-scraped`, bridges each message onto
  `index-page` (BullMQ), same Kafka→BullMQ bridge pattern as the Frontier Consumer. On enqueue:
  `INCR job:{job_id}:pending_index`.
- **Indexing Worker(s)** (API layer, BullMQ workers on `index-page`) — fetch the raw HTML blob from
  SeaweedFS by `blobKey`, clean it (LangChain document transformer), chunk it
  (`RecursiveCharacterTextSplitter`), embed it (LM Studio's OpenAI-compatible API via
  `OpenAIEmbeddings` from `@langchain/openai`), delete any stale vectors for that `url` from Milvus,
  upsert the new chunks. Then decrement `job:{job_id}:pending_index` and run the same completion
  check (§6).
- Milvus collection schema, embedding dimension, retry policy for the index stage, and the
  Query/Answer retrieval API are all still open — see `data-model.md` and `services.md`'s Indexer
  section. Not addressed further here; revisit when Indexer implementation actually starts.

## 8. Infra additions needed (devops)

None of these exist in `devops/` yet — added as part of this same pass since the Scraper can't run
without them:

- **`devops/redis/docker-compose.yml`** — one instance, shared by Scraper and (later) Indexer.
  Backs BullMQ's `process-url` queue and every `job:{job_id}:*` key above. No persistence
  requirement beyond BullMQ's own durability needs (job coordination state is inherently
  short-lived — TTL'd after completion per §6).
- **`devops/seaweedfs/docker-compose.yml`** — single filer+volume node with the S3 API gateway
  enabled (SeaweedFS ships this built in — `weed server -s3`). Bucket: `askmycrawl-raw-html`.
  Object key = the `blobKey` (the raw hash string, no prefix). Access key/secret sourced from
  `devops/.env` (new vars, never baked into an image — per the `devops` agent's non-negotiables),
  consumed by the Scraper via env vars (`SEAWEEDFS_ENDPOINT`, `SEAWEEDFS_ACCESS_KEY`,
  `SEAWEEDFS_SECRET_KEY`, `SEAWEEDFS_BUCKET`). SeaweedFS's S3 API is deliberately
  wire-compatible with the AWS S3 SDK, so the Scraper's blob-storage adapter can use `@aws-sdk/
  client-s3` pointed at the SeaweedFS endpoint — this is also what makes "swap for real AWS S3
  later" a config change, not a rewrite, matching the AWS-phase table in the `devops` agent.
- **`page-scraped` Kafka topic** — add to `kafka-init`'s topic list (`devops/kafka/docker-
  compose.yml`). Partition count: TBD at creation time (event-schemas.md leaves it open; not
  blocking, pick something reasonable like 6 to match `crawl-frontier`'s spread when actually wiring
  this up). Retention: 1 day, matching every other topic in the pipeline.
- **`SCRAPER_FETCH_MAX_ATTEMPTS`** — new env var, default `3` if unset (`devops/.env.example` gets a
  documented entry).

## 9. `kafka-contracts` fixes needed before coding the Scraper

- **Add `page-scraped-message.ts`** (`PageScrapedMessage` interface, matching §5e's payload above)
  — doesn't exist yet, flagged as missing in `CLAUDE.md`.
- **Fix `crawl-complete-message.ts`** — currently just `{job_id, user_id, query}`; needs to grow to
  match §6's payload (`url`, `succeeded_count`, `failed_count`, `succeeded_urls`, `failed_urls`).

## 10. Open items carried forward (not blocking, not decided here)

- Exact BullMQ backoff base delay (implemented as proposed: 5s, exponential — cheap to change, not
  wired to an env var since only the attempt count was asked to be configurable).
- `handleUnsupportedContentType`'s real behavior (§5 step 5) — implemented as a deliberate stub,
  throws `PermanentFetchError('... not implemented')`. Still not decided what it should actually do.
- Per-domain rate limiting — not implemented, not even a stub/interface. Still open, deferred.
- Redis TTL's exact value — implemented as 60 minutes (`JOB_KEY_TTL_SECONDS`,
  `backend/apps/scraper/src/models/constants.ts`), matching `data-model.md`'s "~1 hour" language.

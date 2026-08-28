# Data Model

Single Postgres instance for the project's scale. Tables are grouped by **owning service** below —
even sharing one physical database, only the owning service should write to its tables directly;
other services go through that service's API/events. This is a standing rule for shared
infrastructure generally, not just Postgres — see the `devops` agent's "Non-negotiables".

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()
```

`pgvector` isn't needed — embeddings live in a self-hosted **Milvus** instance instead (see "Owned
by the Scraper and the Indexer" below, and `docs/planning/03-crawler-scraper-indexing-plan.md`).
Postgres holds only relational data (users, jobs, notifications) for this project.

## Owned by Auth Service

**Implemented.** TypeORM, `synchronize: true` outside `NODE_ENV=production` — no migration
framework yet (simplest thing that works for the Docker Compose phase); revisit before this ever
runs against real prod data. Entities: `apps/auth/src/infrastructure/postgres/entities/`.

```sql
CREATE TYPE user_role AS ENUM ('admin', 'user');

CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT NOT NULL UNIQUE,  -- always stored lowercased
  name              TEXT,                 -- optional display name, e.g. for "Hi Alice" in notifications
  phone_number      TEXT,                 -- E.164 format, required before SMS can be sent
  telegram_chat_id  TEXT,                 -- set once the user links their Telegram account
  password_hash     TEXT NOT NULL,        -- SHA-256(pepper + salt + plaintext) — see auth.md
  password_salt     TEXT NOT NULL,        -- random per-user, stored plaintext (salt isn't secret)
  role              user_role NOT NULL DEFAULT 'user',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,       -- SHA-256 of the raw token, no salt/pepper needed —
                                            -- the token itself is already high-entropy random,
                                            -- unlike a human-chosen password
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON refresh_tokens (user_id);
```

## Owned by Job Manager Service

**Not implemented.** One table.

```sql
CREATE TABLE jobs (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- the job_id — generated here, not by the
                                                          -- client; this is the only place a job_id
                                                          -- comes from, see event-schemas.md's
                                                          -- job-requests/job-created
  user_id  UUID NOT NULL REFERENCES users(id),           -- the requesting/recipient user — as sent
                                                          -- on job-requests
  url      TEXT NOT NULL,                                -- the seed URL — as sent on job-requests
  query    TEXT NOT NULL,                                -- the user's question — as sent on
                                                          -- job-requests
  result   TEXT                                          -- NULL until Query/Answer's answer comes
                                                          -- back (answer-ready); Job Manager Service
                                                          -- writes the answer text in here and
                                                          -- nowhere else. NULL is the only "not done
                                                          -- yet" signal — there is no separate
                                                          -- status column (see below).
);
CREATE INDEX ON jobs (user_id);
```

`user_id`/`url`/`query` are exactly the 3 fields Gateway sends on `job-requests` — Job Manager
Service adds only the generated `id` and a `result` that starts `NULL`.

Real gaps in this table, worth stating plainly rather than glossing over:

- **No max-depth column.** Max crawl depth is a fixed system constant (`MAX_CRAWL_DEPTH`, currently
  `3` per the product spec, "crawl depth is capped at 3"), never client-provided and never varies
  per job today, so there's nothing to store per row. It lives in `libs/kafka-contracts` (not
  Scraper-local — Job Manager Service is the one that has to set it, as the starting value of the
  `crawl-frontier` seed message's `depth` field — see `event-schemas.md`), since both Job Manager
  Service (producer) and the Scraper (consumer/decrementer) need to agree on it. May become
  configurable (e.g. per-job or per-user-tier) later; nothing reads it as anything but a constant
  today.
- **No status column.** "Done" is just `result IS NOT NULL`. There is no in-between state
  (`crawling`/`answering`) represented anywhere in Postgres, and no `failed` state either — a crawl
  or answer failure isn't captured on this row at all. This is a real gap, not a considered decision
  to omit failure handling forever: revisit before building Job Manager Service if failed jobs need
  to surface as anything other than "still says NULL forever."
- **No timestamps, no error tracking** on this table.
- **No source attribution.** The answer text is the only thing this table stores — which URLs it
  drew from isn't persisted anywhere in Postgres. Query/Answer Service produces that list
  transiently, during its retrieval step against the Indexer, to build the LLM prompt, but nothing
  carries it further than that call. Flag before assuming the frontend can ever show "answer drew
  from these pages" — that data doesn't survive past the RAG call under this design.

## Owned by the Scraper and the Indexer

**Not implemented.** Neither owns a Postgres table:

- **Scraper** writes raw HTML to **SeaweedFS** (self-hosted, S3-compatible blob store), keyed by
  `sha256(normalizedUrl)`. No freshness/TTL logic, no cross-job cache — every job fetches and
  overwrites the blob for a URL it visits.
- **Indexer** writes embedded chunks to **Milvus** (self-hosted vector DB). Milvus needs an explicit
  collection schema, not inferred from writes:
  - **Vector field**: dimension TBD — set by whichever embedding model is loaded into LM Studio
    (e.g. 768 or 1024, model-dependent; see `docs/specs/README.md`'s stack section). Index
    type/metric: `HNSW` + `COSINE`.
  - **Scalar fields** (filterable/deletable on): `job_id`, `user_id`, `url`, `query`, `chunk_index`,
    `scraped_at`.
  - On re-scrape, the Indexing Worker deletes existing vectors for a `url` (Milvus delete-by-filter,
    e.g. `url == "..."`) before upserting the new chunks.
  - `job_id` as a scalar field is what scopes a RAG query to one job's crawl — there's no cross-job
    content sharing in this design (every job re-fetches and overwrites), so nothing beyond the
    `job_id` already stamped on each chunk is needed to express "which pages belong to which job."

Both services share **Redis** coordination state (dedup set, pending-work counters, completion race
guard) — see "Redis" below. That's ephemeral job-coordination plumbing, not owned domain data, the
same way both already share the `crawl-frontier`/`page-scraped`/`crawl-complete` Kafka topics.

**Not designed**: the read/retrieval API the Indexer needs to expose for Query/Answer Service's
query-time similarity search — flagged in `services.md`'s Indexer section, don't invent a shape for
it here.

## Owned by Notification Service

**Not implemented.**

```sql
CREATE TYPE notification_channel AS ENUM ('email', 'sms', 'telegram');
CREATE TYPE notification_status AS ENUM ('sent', 'failed');

CREATE TABLE notifications_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID NOT NULL,
  user_id      UUID NOT NULL,
  channel      notification_channel NOT NULL,
  status       notification_status NOT NULL,
  error_message TEXT,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON notifications_log (job_id);
CREATE INDEX ON notifications_log (user_id);
```

## Redis

**Implemented** (the Scraper's side — `devops/redis`, one shared instance; the Indexer will reuse
it once built, not provision its own). Per-job coordination state shared between the Scraper and
the Indexer (dedup set, two pending-work counters, completion race guard), plus BullMQ's own
internal queue keys for the `process-url`/`index-page` queues. Not a table of record for either
service — see "Owned by the Scraper and the Indexer" above. Full key list in
`docs/planning/03-crawler-scraper-indexing-plan.md`'s "Redis keys" table:

| Key | Type | Purpose |
|---|---|---|
| `crawl:{job_id}:visited` | Set | authoritative per-job dedup gate |
| `job:{job_id}:pending_scrape` | Int | completion tracking |
| `job:{job_id}:pending_index` | Int | completion tracking |
| `job:{job_id}:succeeded` | Set | URLs that finished the full pipeline successfully |
| `job:{job_id}:failed` | Set | URLs that terminally failed (scrape or index stage) |
| `job:{job_id}:notified` | flag | race guard, completion fires exactly once |

No `job:{job_id}:meta` hash — `user_id`/`query`/`base_url` (the job's seed URL, from which
`base_domain` is derived on demand) all ride on the `crawl-frontier` Kafka message itself instead,
propagate-only fields set once by Job Manager Service's seed message and copied through unchanged
by the Scraper on every child it re-publishes (see `event-schemas.md`'s `crawl-frontier` entry) —
no separate Redis-stored copy needed.

All job-scoped keys get a short cleanup TTL (e.g. 1 hour) once a job completes — no indefinite
growth. No global cross-job cache.

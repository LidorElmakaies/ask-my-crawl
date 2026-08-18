# Data Model

Single Postgres instance for the project's scale, `pgvector` extension enabled. Tables are grouped
by **owning service** below — even sharing one physical database, only the owning service should
write to its tables directly; other services go through that service's API/events.

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()
```

## Owned by Auth Service

```sql
CREATE TYPE user_role AS ENUM ('admin', 'user');

CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT NOT NULL UNIQUE,
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
  token_hash   TEXT NOT NULL UNIQUE,       -- store a hash, never the raw token
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON refresh_tokens (user_id);
```

## Owned by Crawl Result Manager

```sql
CREATE TYPE job_status AS ENUM ('pending', 'crawling', 'answering', 'completed', 'failed');

CREATE TABLE jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  seed_url      TEXT NOT NULL,
  query         TEXT NOT NULL,             -- the user's question
  depth_limit   INT NOT NULL DEFAULT 3,
  status        job_status NOT NULL DEFAULT 'pending',
  error_message TEXT,                      -- populated if status = 'failed'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);
CREATE INDEX ON jobs (user_id);
CREATE INDEX ON jobs (status);

CREATE TABLE results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  answer_text   TEXT NOT NULL,
  source_page_ids UUID[] NOT NULL,         -- pages.id values the LLM answer drew from
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Owned by Search Result Manager

```sql
CREATE TABLE pages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url              TEXT NOT NULL UNIQUE,   -- normalized form, see auth.md / event-schemas.md
  url_hash         TEXT NOT NULL UNIQUE,   -- sha256(url), matches Redis page:{url_hash} key
  content          TEXT NOT NULL,          -- LangChain-cleaned text
  outbound_links   JSONB NOT NULL DEFAULT '[]', -- normalized child URLs found on this page —
                                                  -- needed so a cache-hit job can still expand
                                                  -- its own BFS without re-fetching the page
  scraped_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON pages (url_hash);

-- One row per embedded chunk of a page (a page's cleaned text is split before embedding).
CREATE TABLE page_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id      UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  chunk_index  INT NOT NULL,
  chunk_text   TEXT NOT NULL,
  embedding    VECTOR(1536) NOT NULL       -- dimension depends on embedding model — TBD, see specs/README.md
);
CREATE INDEX ON page_chunks (page_id);
CREATE INDEX ON page_chunks USING ivfflat (embedding vector_cosine_ops);

-- Which pages belong to which job's answer corpus (scopes RAG queries to one job,
-- even though `pages` content is shared/cached globally across all jobs).
CREATE TABLE job_pages (
  job_id       UUID NOT NULL, -- references jobs(id), cross-service FK not enforced at DB level
  page_id      UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  depth_found  INT NOT NULL,             -- depth this page was discovered at within this job
  PRIMARY KEY (job_id, page_id)
);
```

> `job_pages.job_id` references a table owned by a different service (Crawl Result Manager). No
> DB-level foreign key across service boundaries — consistency is maintained by the Crawl Worker,
> which only ever inserts a `job_pages` row for a `job_id` it received in a valid Kafka message.

## Owned by Notification Service

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

## Redis (not Postgres — ephemeral/coordination state only)

See [planning notes §3](../planning/01-architecture-notes.md#3-redis--decided-design) for full detail.

| Key | Type | TTL | Purpose |
|---|---|---|---|
| `job:{job_id}:visited` | Set | ~48h | per-job BFS visited/claim set |
| `job:{job_id}:pending` | Integer | ~2h | fan-out/fan-in completion counter |
| `page:{url_hash}` | String (`SET NX EX`) | 3 days | global "don't re-scrape this URL yet" marker |

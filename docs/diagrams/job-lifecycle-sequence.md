# Job Lifecycle — End to End

From "submit a URL + question" to "see the answer live," through every Kafka hop. Kafka is drawn as
one participant (the bus) since every hop below is publish/subscribe, not a direct call — that's
also why `POST /jobs` returns before a `job_id` even exists. See
[docs/specs/full-spec.md §6](../specs/full-spec.md) for the exact payload shape on every topic named
below, and [crawl-index-flowchart.md](crawl-index-flowchart.md) for what "crawl + scrape + index"
actually does in a loop (collapsed to one pass here for readability).

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Frontend
    participant GW as Gateway
    participant K as Kafka
    participant JM as Job Manager
    participant SC as Scraper
    participant IX as Indexer
    participant QA as Query/Answer
    participant LLM as LLM / Embeddings

    User->>FE: enter URL + question, tap Send
    FE->>GW: POST /jobs { url, query }
    GW->>K: publish job-requests { user_id, url, query }
    GW-->>FE: 202 { status: "accepted" } (no job_id yet)

    K->>JM: job-requests
    JM->>JM: INSERT jobs row (generates job_id, result = NULL)
    JM->>K: publish crawl-frontier (seed, depth = MAX_CRAWL_DEPTH)
    JM->>K: publish job-created { job_id, user_id, url, query }

    K->>GW: job-created
    GW-->>FE: WS push: job.created { job_id, ... }
    FE-->>User: shows the job as "in progress" with its real id

    K->>SC: crawl-frontier (seed + every re-published child)
    Note over SC: Frontier Consumer dedups (Redis SADD),<br/>Scraper Worker fetches, saves to SeaweedFS,<br/>re-publishes child URLs back onto crawl-frontier
    SC->>K: publish page-scraped (per successfully scraped page)
    SC->>K: publish crawl-frontier (child URLs, depth - 1)

    K->>IX: page-scraped
    Note over IX: Indexing Worker fetches blob from SeaweedFS,<br/>chunks + embeds text, upserts vectors
    IX->>LLM: embed chunk text
    LLM-->>IX: embedding vectors
    Note over IX: once both pending counters hit zero<br/>(SET NX wins the completion race)
    IX->>K: publish crawl-complete { job_id, query, url, ... }

    K->>QA: crawl-complete
    QA->>LLM: embed the job's query
    LLM-->>QA: query embedding
    QA->>QA: search Qdrant top-k chunks, filtered by job_id
    QA->>LLM: chat completion (system + user RAG prompt)
    LLM-->>QA: answer text
    QA->>K: publish answer-ready { job_id, answer_text }

    K->>JM: answer-ready
    JM->>JM: UPDATE jobs SET result = answer_text
    JM->>K: publish result-saved { job_id, result }

    K->>GW: result-saved
    GW-->>FE: WS push: job.completed { job_id, result }
    FE-->>User: shows the answer live
```

**On a failure anywhere in the answer step**: Query/Answer republishes `crawl-complete` itself with
`retry_count` incremented (a Kafka-native retry loop, capped backoff) instead of giving up
immediately; past `ANSWER_MAX_RETRIES` (or on a permanent error) it publishes `answer-ready` with
`failed_reason` set instead of `answer_text`, and everything downstream (`result-saved`,
`job.completed`) carries `failed_reason` instead. A user can then retry via `POST /jobs/:id/retry`,
which republishes `crawl-complete` directly — no re-crawl, Qdrant's chunks are reused as-is.

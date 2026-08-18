# Event Schemas (Kafka)

All services connect via `@nestjs/microservices`' Kafka transporter (kafkajs underneath). Partition
key is noted per topic — job coordination correctness comes from Redis (§ data-model.md), not from
Kafka ordering, so partition keys are chosen for even load distribution, not ordering guarantees.

## `crawl-frontier`

The BFS work queue — both the initial seed URL and every subsequently-discovered URL go on this one
topic, per the original design ("we put the urls found in the kafka same topic but the depth is one
lower").

- **Producers**: Crawl Result Manager (seed message, on job creation), Crawl Worker (child URLs)
- **Consumers**: Crawl Worker pool, consumer group `crawl-workers`
- **Partition key**: `url_hash` (spreads load evenly; a worker doesn't need messages for the same
  job co-located)
- **Value**:
  ```jsonc
  {
    "job_id": "uuid",
    "user_id": "uuid",
    "url": "https://example.com/page",   // not yet normalized — worker normalizes on receipt
    "depth": 3                            // always >= 1; depth-0 URLs are never produced (see data-model.md)
  }
  ```

## `crawl-frontier-dlq`

Failed crawl-frontier messages after retry exhaustion (retry policy TBD — e.g. 3 attempts with
backoff at the consumer level before landing here). A message here must still trigger the Redis
`DECR` for its job's pending counter — a dead-lettered URL still counts as "finished," or the job
hangs forever.

- **Producers**: Crawl Worker (on unrecoverable fetch error)
- **Consumers**: none yet wired up — placeholder for future alerting/manual replay tooling
- **Value**: same as `crawl-frontier`, plus `{ "error": "string", "failed_at": "ISO8601" }`

## `crawl-complete`

Fired once by whichever Crawl Worker's `DECR` on `job:{job_id}:pending` hits zero — i.e. the last
outstanding URL for a job just finished.

- **Producers**: Crawl Worker
- **Consumers**: Query/Answer Service, consumer group `query-answer`
- **Partition key**: `job_id`
- **Value**:
  ```jsonc
  {
    "job_id": "uuid",
    "user_id": "uuid",
    "query": "the user's original question"
  }
  ```

## `answer-ready`

Fired once the Query/Answer Service has run retrieval + the LLM call. Two independent consumer
groups read this topic in parallel — Kafka pub/sub, not point-to-point — matching the original
description of the answer going to both notification and persistence at the same stage.

- **Producers**: Query/Answer Service
- **Consumers**:
  - Notification Service, consumer group `notification-service`
  - Crawl Result Manager, consumer group `crawl-result-manager`
- **Partition key**: `job_id`
- **Value**:
  ```jsonc
  {
    "job_id": "uuid",
    "user_id": "uuid",
    "answer_text": "string",
    "source_page_ids": ["uuid", "..."]
  }
  ```

## `result-saved`

Fired by the Crawl Result Manager once it has persisted the `results` row, so the Gateway can push
the update to the user's open WebSocket connection.

- **Producers**: Crawl Result Manager
- **Consumers**: Gateway, consumer group `gateway`
- **Partition key**: `user_id`
- **Value**:
  ```jsonc
  {
    "job_id": "uuid",
    "user_id": "uuid",
    "answer_text": "string",
    "completed_at": "ISO8601"
  }
  ```
- Gateway behavior on receipt: look up an active WebSocket connection for `user_id` in its
  connection registry; if connected, push a `job.completed` event with this payload. If the user
  isn't currently connected, no action needed here — they still get email/SMS/Telegram, and will see
  the result via a normal `GET /jobs/:id` on next load (see api-contracts.md).

## Topic config (starting point, not final)

| Topic | Partitions | Retention |
|---|---|---|
| `crawl-frontier` | 6 | 1 day |
| `crawl-frontier-dlq` | 3 | 7 days |
| `crawl-complete` | 3 | 1 day |
| `answer-ready` | 3 | 1 day |
| `result-saved` | 3 | 1 day |

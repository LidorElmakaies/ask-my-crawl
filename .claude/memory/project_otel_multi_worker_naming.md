---
name: project_otel_multi_worker_naming
description: OTel service/instance naming needs a dynamic per-worker scheme once Scraper/Indexer run multiple BullMQ workers per process — not just per-service container scaling
metadata:
  type: project
---

Today `startOtel(serviceName)` (`backend/libs/otel/src/start-otel.ts`) takes one static name per
process, called once as the literal first statement of `main.ts` (e.g. `startOtel('job-manager')`,
`startOtel('gateway')`) — see [[project_askmycrawl]]. A prior (now-reverted, uncommitted) version of
this lib added `getOtelServiceInstanceId()` returning the container hostname, specifically to tell
apart replicas under `docker compose up --scale <service>=N` — but that only disambiguates whole
*service containers*, not multiple *worker processes* running inside the same one.

The Scraper and Indexer (`docs/planning/03-crawler-scraper-indexing-plan.md`) each run multiple
BullMQ workers (`process-url`, `index-page`) — potentially several worker processes/instances per
container, not just one per container the way Gateway/Auth/Job Manager Service are. When those get
built, the OTel identification scheme needs a dynamic per-worker component (e.g. a worker
id/index/PID/uuid baked into `service.instance.id` or a separate attribute), not just the container
hostname — otherwise every BullMQ worker in one container looks identical in Grafana/Loki/Tempo,
making per-worker debugging (which worker picked up which job, which one is stuck) impossible.

**Why:** the user flagged this explicitly while unrelated OTel work was being discarded from the
working tree, before Scraper/Indexer exist — a note to not lose before that work starts.

**How to apply:** when building the Scraper/Indexer's Frontier Consumer / Scraper Worker / Index
Intake Consumer / Indexing Worker (`.claude/agents/backend.md`'s job-manager entry sibling apps),
design `startOtel`'s (or whatever it's evolved into by then) instance-identification scheme to
accept/derive a worker-level id, not just a service-level name — flag this to the user rather than
silently defaulting to hostname-only identification again.

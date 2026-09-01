# Diagrams

Mermaid flowcharts and sequence diagrams for askmycrawl, kept alongside the prose specs in
[docs/specs/full-spec.md](../specs/full-spec.md) (the source of truth if a diagram and the prose
ever disagree — diagrams summarize, they don't redefine).

| File | Kind | Covers |
|---|---|---|
| [system-architecture.md](system-architecture.md) | Flowchart | Every service + data store, at a glance |
| [job-lifecycle-sequence.md](job-lifecycle-sequence.md) | Sequence | Submit → crawl → index → answer → live push, end to end |
| [crawl-index-flowchart.md](crawl-index-flowchart.md) | Flowchart | Scraper/Indexer internals: BFS frontier, dedup, completion race |
| [auth-sequence.md](auth-sequence.md) | Sequence | Register, login, token refresh, per-request verification |
| [admin-proxy-sequence.md](admin-proxy-sequence.md) | Sequence | Admin-gated Grafana/Kafka UI reverse proxy |

All render natively wherever GitHub or a Mermaid-aware Markdown viewer opens them — no separate
image files.

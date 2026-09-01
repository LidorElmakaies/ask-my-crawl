# System Architecture

Every service and data store, and what talks to what. Solid arrows are Kafka messages; dashed
arrows are synchronous HTTP calls. See [docs/specs/full-spec.md §3–4](../specs/full-spec.md) for
the prose version.

```mermaid
flowchart TB
    Client["Frontend\n(Expo / React Native)"]

    subgraph Edge["Edge"]
        Gateway["Gateway\nHTTP + WebSocket"]
    end

    subgraph Core["Core services"]
        Auth["Auth Service"]
        JobMgr["Job Manager Service"]
        Scraper["Scraper"]
        Indexer["Indexer"]
        QA["Query/Answer Service"]
        Notif["Notification Service\n(not implemented)"]
    end

    subgraph Data["Data stores"]
        PG[("Postgres")]
        Redis[("Redis")]
        Weed[("SeaweedFS\nraw HTML")]
        Qdrant[("Qdrant\nvectors")]
    end

    LLM["LLM / Embedding server\n(LM Studio, OpenAI-compatible)"]

    Client -- "HTTP + WS" --> Gateway
    Gateway -. "HTTP: /auth/*, /me, /admin/users*" .-> Auth
    Gateway -. "HTTP: GET /jobs*" .-> JobMgr
    Gateway -- "job-requests" --> JobMgr
    JobMgr -- "job-created" --> Gateway
    JobMgr -- "result-saved" --> Gateway

    Auth --> PG

    JobMgr -- "crawl-frontier (seed)" --> Scraper
    JobMgr --> PG

    Scraper -- "crawl-frontier (children)" --> Scraper
    Scraper -- "page-scraped" --> Indexer
    Scraper --> Redis
    Scraper --> Weed

    Indexer --> Redis
    Indexer -- "reads" --> Weed
    Indexer -- "writes" --> Qdrant
    Indexer -. "embed" .-> LLM
    Indexer -- "crawl-complete" --> QA

    QA -- "reads" --> Qdrant
    QA -. "embed + chat" .-> LLM
    QA -- "answer-ready" --> JobMgr
    QA -- "answer-ready" --> Notif
    QA -- "crawl-complete (self-retry)" --> QA

    JobMgr -. "crawl-complete (manual retry)" .-> QA
```

# Crawl + Index — Scraper/Indexer Internals

What actually happens inside the "crawl the site" and "index what it found" boxes of
[job-lifecycle-sequence.md](job-lifecycle-sequence.md) — the BFS frontier loop, the per-job dedup
gate, and the completion-detection race. Full mechanism:
[docs/planning/03-crawler-scraper-indexing-plan.md](../planning/03-crawler-scraper-indexing-plan.md).

## Scraper: one `crawl-frontier` message

```mermaid
flowchart TD
    Start(["crawl-frontier message\n{job_id, url, depth, base_url}"]) --> Strip["stripFragment(url)"]
    Strip --> Dedup{"SADD crawl:{job_id}:visited\nnewly added?"}
    Dedup -- "no, already seen" --> Drop(["drop — no further action"])
    Dedup -- "yes" --> Incr["INCR job:{job_id}:pending_scrape\nenqueue onto process-url (BullMQ)"]

    Incr --> Fetch["Scraper Worker: HTTP fetch\n(30s timeout, no JS)"]
    Fetch --> Outcome{"outcome?"}

    Outcome -- "4xx (permanent)" --> Fail["SADD job:{job_id}:failed\nDECR pending_scrape"]
    Outcome -- "timeout / conn error / 5xx" --> Retry{"attempts <\nSCRAPER_FETCH_MAX_ATTEMPTS?"}
    Retry -- "yes" --> Fetch
    Retry -- "no, exhausted" --> Fail

    Outcome -- "2xx, HTML" --> Save["save raw HTML to SeaweedFS\nkey = sha256(stripFragment(url))"]
    Outcome -- "2xx, other content-type" --> Stub(["handleUnsupportedContentType\n(deliberate stub, not implemented)"])

    Save --> Extract["extract outbound links"]
    Extract --> Filter{"same domain as base_url\n(ignoring leading www.)\nAND depth - 1 > 0 ?"}
    Filter -- "yes, per link" --> Republish["publish crawl-frontier\n{url: child, depth: depth-1, base_url}"]
    Filter -- "no" --> NoChild(["link dropped, no child produced"])

    Republish -. "fed back into the Scraper" .-> Start

    Save --> PageScraped["publish page-scraped\n{job_id, url, blobKey, base_url}"]
    Save --> Succeed["SADD job:{job_id}:succeeded\nDECR pending_scrape"]

    Fail --> NoteScrape(["no completion check here —\nonly the Indexer checks, see below"])
    Succeed --> NoteScrape
```

## Indexer: one `page-scraped` message, and the completion race

```mermaid
flowchart TD
    Start(["page-scraped message\n{job_id, url, blobKey, base_url}"]) --> Incr["INCR job:{job_id}:pending_index\nenqueue onto index-page (BullMQ)\n(no dedup gate needed)"]
    Incr --> Fetch["Indexing Worker: fetch blob\nfrom SeaweedFS by blobKey"]
    Fetch --> Strip["strip to plain text (cheerio)"]
    Strip --> Chunk["chunk (RecursiveCharacterTextSplitter\n1000/200 size/overlap)"]
    Chunk --> Embed["embed each chunk\n(LM Studio / OpenAI-compatible,\nencodingFormat: 'float')"]
    Embed --> DeleteOld["delete stale vectors for this url\n(Qdrant delete-by-filter)"]
    DeleteOld --> Upsert["upsert new chunks into Qdrant\n(fresh randomUUID() per chunk)"]
    Upsert --> Decr["DECR job:{job_id}:pending_index"]

    Decr --> Check{"pending_scrape == 0\nAND pending_index == 0 ?"}
    Check -- "no" --> Done(["done for this message"])
    Check -- "yes" --> Race{"SET job:{job_id}:notified NX\n— won the race?"}
    Race -- "no, someone else won" --> Done
    Race -- "yes" --> Publish["read succeeded/failed sets,\npublish crawl-complete\n{job_id, query, url, counts, urls}"]
    Publish --> Expire["EXPIRE every job:{job_id}:* key\n(~1h cleanup window)"]
```

**Why only the Indexer checks for completion**, never the Scraper: `page-scraped` delivery from the
Scraper to the Indexer is asynchronous. If the Scraper's own decrement also checked
`pending_index == 0`, a single-page job (no child links) could observe it as zero simply because
the Indexer hasn't incremented it yet — not because indexing actually finished — and fire
`crawl-complete` before the page is even queued for indexing. The job isn't done until it's
searchable, not merely scraped, so only the side that knows indexing is finished may declare
completion. The `SET NX` guard still matters even with one checker: at-least-once Kafka redelivery
of the same `page-scraped` message could otherwise decrement `pending_index` twice, letting two
worker calls both observe zero-zero for the same job.

---
name: feedback-use-real-test-domain-for-scraper
description: When demoing/testing the Scraper, seed crawls against a real multi-page site built for scraping practice (web-scraping.dev), not example.com/info.cern.ch placeholder pages
metadata:
  type: feedback
---

For manual/demo verification of the Scraper (e.g. via [[project-askmycrawl]]'s
`backend/scripts/debug-crawl.ts`), use `https://web-scraping.dev/` as the seed URL — not
`example.com` or `info.cern.ch`. The user explicitly said (2026-08-28) they don't want an
"example html," they want a real domain built for scraping practice, like the one they'd already
used themselves for this.

**Why:** `web-scraping.dev` is a real multi-page site purpose-built for scraping tests (products,
pagination, reviews, login, cart, a PDF and a non-HTML API endpoint) — it exercises same-domain
link-following, depth limits, and the unsupported-content-type path all in one crawl, unlike a
single static page.

**How to apply:** default to `https://web-scraping.dev/` (or a specific page under it, e.g.
`/reviews`) as the seed URL for any future Scraper demo/smoke test, instead of reaching for
`example.com`/`info.cern.ch` out of habit.

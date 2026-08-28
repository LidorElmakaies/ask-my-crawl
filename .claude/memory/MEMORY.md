# Memory Index

- [askmycrawl project](project_askmycrawl.md) — ongoing crawl+RAG+notify project: stack, architecture, where its docs live
- [Commits need explicit approval](feedback_commits_need_explicit_approval.md) — never commit proactively; ask first, even for docs-only work
- [Gateway-only service access](feedback_gateway_only_service_access.md) — the frontend only ever reaches the Gateway, never a backend service directly; internal service-to-service calls are unaffected
- [Agent Teams Reference](reference_agent_teams.md) — How to enable/use Claude Code experimental agent teams: capabilities, architecture, best practices, and limitations
- [OTel needs per-worker naming later](project_otel_multi_worker_naming.md) — Scraper/Indexer will run multiple BullMQ workers per process; OTel identification must go beyond container-hostname-per-service when those get built
- [Use a real test domain for Scraper demos](feedback_use_real_test_domain_for_scraper.md) — seed test crawls against web-scraping.dev, not example.com/info.cern.ch

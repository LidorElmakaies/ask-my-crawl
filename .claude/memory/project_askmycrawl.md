---
name: askmycrawl-project
description: "Ongoing multi-service crawl+RAG+notify project (askmycrawl) — stack, architecture, and where its docs live"
metadata: 
  node_type: memory
  type: project
  originSessionId: b62546f6-dca5-4823-9e96-77d4fc9cdf51
  modified: 2026-08-18T16:31:34.704Z
---

**askmycrawl** (at `C:\Users\agame\OneDrive\Desktop\HOMEWORK\askmycrawl`) is a role-based
(admin/user) app: a user submits a URL + a question, the backend crawls the site (depth-limited
BFS via Kafka, depth constant 3, Redis-coordinated dedup + a 3-day global content cache), extracts
and vectorizes content (LangChain.js + pgvector), answers the question via an LLM (RAG), and
notifies the user by email, SMS, and Telegram — plus a live WebSocket push to a dedicated UI tab.

Bootstrapped from a sibling project `crawlqa` (frontend-only clone, see
[[askmycrawl-cloned-from-crawlqa]] if that memory exists) — the frontend (Expo/React Native) was
carried over as-is and later evolves alongside the new backend.

**Stack (decided)**: NestJS (Node.js/TypeScript) for every backend service — one language across
the whole backend, using `langchain.js`. Frontend stays Expo/React Native, built from reusable
components (e.g. one shared input-field component across scraper/register/login, not per-screen
markup). Deploy target: **Docker Compose now** (`devops/docker-compose.yml`), AWS is a documented
future phase only. Backend follows a strict 3-layer clean/hexagonal architecture per service (API →
Application → Infrastructure, dependency-inverted via NestJS DI interface tokens, each layer owning
an `interfaces/` folder for what *it* implements) — documented in `docs/specs/backend-architecture.md`.
Kafka producers are Infrastructure-layer; consumers are API-layer.

**Where things live in the repo**:
- `docs/planning/01-architecture-notes.md` — raw decision log/rationale (Redis design, language
  choice reasoning, depth-0 semantics, etc.)
- `docs/specs/` — formal specs: `data-model.md`, `event-schemas.md`, `api-contracts.md`,
  `services.md`, `auth.md`, `backend-architecture.md`
- `.claude/agents/{backend,frontend,devops,testing}.md` — real Claude Code subagent definitions
  (proper frontmatter: name/description/tools) for agent-teams work on this project — NOT plain
  `AGENTS.md` convention files in each directory; that was tried once and corrected. The
  pre-existing `frontend/AGENTS.md` (Expo-version-warning-only) is unrelated and was restored after
  being briefly overwritten by mistake.

See [[feedback_commits_need_explicit_approval]] — commits on this repo need explicit sign-off, not
automatic after finishing a chunk of work.

**Memory location**: as of 2026-08-20, this project's Claude memory lives here
(`askmycrawl/.claude/memory/`), pointed at via `autoMemoryDirectory` in
`askmycrawl/.claude/settings.local.json` — not the default global per-workspace path. Moved at the
user's explicit request so memory travels with the repo checkout rather than living in a fixed
global location keyed off the folder path.

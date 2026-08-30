// Job-coordination cleanup window after a crawl completes (docs/planning/
// 03-crawler-scraper-indexing-plan.md §6) — same value as the Scraper's own copy
// (apps/scraper/src/models/constants.ts). Not imported from there — see this app's own
// infrastructure/redis/redis-coordination.store.ts doc comment for why the two stay independent
// copies rather than a shared lib.
export const JOB_KEY_TTL_SECONDS = 60 * 60;

// RecursiveCharacterTextSplitter config — genuinely undecided anywhere in the spec/planning docs
// before this pass (docs/planning/03-crawler-scraper-indexing-plan.md §7 left chunk size/overlap
// unset). 1000/200 is a common, unremarkable starting point for prose-heavy scraped HTML; revisit
// once real answer quality can be measured against it, not a considered-final choice.
export const CHUNK_SIZE = 1000;
export const CHUNK_OVERLAP = 200;

// Default vector DB collection name — overridable via VECTOR_DB_COLLECTION (see
// QdrantVectorStore/backend/.env.example).
export const DEFAULT_VECTOR_DB_COLLECTION = 'askmycrawl_chunks';

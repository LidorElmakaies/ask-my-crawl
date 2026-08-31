// Job-coordination cleanup window (docs/planning/03-crawler-scraper-indexing-plan.md §6).
export const JOB_KEY_TTL_SECONDS = 60 * 60;

// RecursiveCharacterTextSplitter config — not tuned against real answer quality yet.
export const CHUNK_SIZE = 1000;
export const CHUNK_OVERLAP = 200;

// Default vector DB collection name — overridable via VECTOR_DB_COLLECTION (see
// QdrantVectorStore/backend/.env.example).
export const DEFAULT_VECTOR_DB_COLLECTION = 'askmycrawl_chunks';

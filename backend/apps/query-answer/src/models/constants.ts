// See docs/planning/04-retrieval-quality-plan.md for the multi-query/RRF retrieval design.
export const RETRIEVAL_TOP_K = 15;
export const DEFAULT_VECTOR_DB_COLLECTION = 'askmycrawl_chunks';
export const QUERY_EXPANSION_COUNT = 2;
export const RRF_K = 60;
export const FUSION_TOP_K_PER_MODALITY = 5;

export const ANSWER_MAX_RETRIES = Number(process.env.ANSWER_MAX_RETRIES ?? 5);
export const ANSWER_RETRY_BACKOFF_BASE_MS = 2000;
export const ANSWER_RETRY_BACKOFF_CAP_MS = 15000;

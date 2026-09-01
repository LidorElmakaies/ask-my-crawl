export const RETRIEVAL_TOP_K = 5;
export const DEFAULT_VECTOR_DB_COLLECTION = 'askmycrawl_chunks';

export const ANSWER_MAX_RETRIES = Number(process.env.ANSWER_MAX_RETRIES ?? 5);
export const ANSWER_RETRY_BACKOFF_BASE_MS = 2000;
export const ANSWER_RETRY_BACKOFF_CAP_MS = 15000;

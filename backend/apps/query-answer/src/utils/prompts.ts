import { QUERY_EXPANSION_COUNT } from '../models/constants';
import type { RetrievedChunk } from '../models/retrieved-chunk';

export const ANSWERING_SYSTEM_PROMPT =
  'You are an assistant answering questions about the content of web pages that were crawled ' +
  'for the user. The context below is the ONLY source of truth you have — it was retrieved from ' +
  'a vector database of the crawled pages. Do not use any outside knowledge, training data, or ' +
  "general facts you may know about the topic, even if you're confident they're correct — a " +
  'correct-sounding answer not grounded in the context below is still wrong for this task. If ' +
  "the context doesn't contain enough information to answer the question, do not guess or fill " +
  'gaps from memory — say plainly that you cannot answer the question based on the pages that ' +
  'were crawled, and briefly note why (e.g. the crawl may not have gone deep enough, or the ' +
  'given URL may not have covered that topic).';

export function buildAnsweringUserPrompt(
  query: string,
  chunks: RetrievedChunk[],
): string {
  if (chunks.length === 0) {
    return (
      'No content was retrieved from the crawl for this question — the crawl may have failed ' +
      'to index any pages, or nothing relevant was found.\n\n' +
      `Question: ${query}`
    );
  }

  const context = chunks
    .map((chunk, i) => `[${i + 1}] (source: ${chunk.url})\n${chunk.text}`)
    .join('\n\n');

  return `Context from the crawled pages:\n\n${context}\n\nQuestion: ${query}`;
}

export const QUERY_EXPANSION_SYSTEM_PROMPT =
  "You rewrite a user's question into alternate search queries for a retrieval system, so that " +
  "different phrasings can find the right passage even when the original wording doesn't closely " +
  `match the source text. Given the user's question, produce exactly ${QUERY_EXPANSION_COUNT} ` +
  'rewrites: (1) a broader, more general paraphrase that uses different vocabulary than the ' +
  "original; (2) a variant that keeps the original's distinctive or unusual words and phrases " +
  'verbatim, but restructures the sentence around them. Respond with ONLY a JSON array of exactly ' +
  `${QUERY_EXPANSION_COUNT} strings, no other text, no markdown code fences.`;

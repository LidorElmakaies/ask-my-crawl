import type { RetrievedChunk } from '../models/retrieved-chunk';

/** Stable identity for a chunk within one job. */
export function chunkKey(chunk: RetrievedChunk): string {
  return `${chunk.url}#${chunk.chunkIndex}`;
}

/** Dedupes by (url, chunkIndex), keeping the first occurrence. */
export function dedupeChunks(chunks: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<string>();
  const result: RetrievedChunk[] = [];
  for (const chunk of chunks) {
    const key = chunkKey(chunk);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(chunk);
  }
  return result;
}

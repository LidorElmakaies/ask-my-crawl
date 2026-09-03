import { RRF_K } from '../models/constants';
import type { RetrievedChunk } from '../models/retrieved-chunk';
import { chunkKey } from './chunk-utils';

/**
 * Reciprocal Rank Fusion (Cormack, Clarke & Buettcher, 2009): score(chunk) = Σ 1/(k + rank) over
 * every list it appears in. Rank-based, not score-based, so lists on unrelated scales fuse safely.
 * See docs/planning/04-retrieval-quality-plan.md.
 */
export function reciprocalRankFusion(
  rankedLists: RetrievedChunk[][],
  k: number = RRF_K,
): RetrievedChunk[] {
  const scores = new Map<string, number>();
  const chunksByKey = new Map<string, RetrievedChunk>();

  for (const list of rankedLists) {
    list.forEach((chunk, index) => {
      const rank = index + 1;
      const key = chunkKey(chunk);
      scores.set(key, (scores.get(key) ?? 0) + 1 / (k + rank));
      chunksByKey.set(key, chunk);
    });
  }

  return [...scores.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([key, score]) => ({ ...chunksByKey.get(key)!, score }));
}

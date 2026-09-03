import { reciprocalRankFusion } from './reciprocal-rank-fusion';
import type { RetrievedChunk } from '../models/retrieved-chunk';

function chunk(url: string, chunkIndex: number, score = 0): RetrievedChunk {
  return { text: `text for ${url}#${chunkIndex}`, url, chunkIndex, score };
}

describe('reciprocalRankFusion', () => {
  it('ranks a chunk appearing near the top of several lists above one that is #1 in only one list', () => {
    const consensus = chunk('https://example.com/a', 0);
    const singleWinner = chunk('https://example.com/b', 0);

    const fused = reciprocalRankFusion([
      [singleWinner, consensus],
      [consensus, chunk('https://example.com/c', 0)],
      [consensus, chunk('https://example.com/d', 0)],
    ]);

    expect(fused[0]).toMatchObject({ url: consensus.url, chunkIndex: 0 });
  });

  it("fuses purely by rank, ignoring each list's raw score", () => {
    const a = chunk('https://example.com/a', 0, 0.99);
    const b = chunk('https://example.com/b', 0, 0.01);

    const fused = reciprocalRankFusion([[b, a]]);

    expect(fused[0].url).toBe(b.url);
    expect(fused[0].score).toBeCloseTo(1 / 61); // k defaults to 60, rank 1
  });

  it('deduplicates the same chunk (url+chunkIndex) across lists into one fused entry', () => {
    const c = chunk('https://example.com/a', 2);
    const fused = reciprocalRankFusion([[c], [c], [c]]);

    expect(fused).toHaveLength(1);
    expect(fused[0].score).toBeCloseTo(3 / 61);
  });

  it('returns an empty array when every input list is empty', () => {
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });

  it('treats a chunk missing from a list as contributing nothing, not a penalty', () => {
    const inBoth = chunk('https://example.com/a', 0);
    const inOneOnly = chunk('https://example.com/b', 0);

    const fused = reciprocalRankFusion([[inBoth, inOneOnly], [inBoth]]);

    const byUrl = new Map(fused.map((c) => [c.url, c.score]));
    expect(byUrl.get(inBoth.url)).toBeCloseTo(1 / 61 + 1 / 61);
    expect(byUrl.get(inOneOnly.url)).toBeCloseTo(1 / 62);
  });
});

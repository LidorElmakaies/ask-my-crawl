import { bm25Rank } from './bm25';

describe('bm25Rank', () => {
  it('ranks a document with exact term overlap above topically-similar documents without it', () => {
    const results = bm25Rank(
      'irresistible adventure impassioned argument music',
      [
        {
          id: 'correct',
          text: 'a brainy, irresistible adventure and an impassioned argument about music',
        },
        {
          id: 'unrelated-1',
          text: 'a guide to spiritual enlightenment and inner peace',
        },
        {
          id: 'unrelated-2',
          text: 'wake up your life, free your soul, find your tribe',
        },
      ],
    );

    const byId = new Map(results.map((r) => [r.id, r.score]));
    expect(byId.get('correct')).toBeGreaterThan(byId.get('unrelated-1')!);
    expect(byId.get('correct')).toBeGreaterThan(byId.get('unrelated-2')!);
  });

  it('scores a document with no shared terms as exactly 0, never negative', () => {
    const results = bm25Rank('music liberating power', [
      {
        id: 'no-overlap',
        text: 'a completely different topic about gardening',
      },
    ]);

    expect(results[0].score).toBe(0);
  });

  it('returns 0 for every document when the query has no tokenizable terms', () => {
    const results = bm25Rank('   ', [
      { id: 'a', text: 'anything' },
      { id: 'b', text: 'something else' },
    ]);

    expect(results).toEqual([
      { id: 'a', score: 0 },
      { id: 'b', score: 0 },
    ]);
  });

  it('returns an empty array for an empty document set', () => {
    expect(bm25Rank('any query', [])).toEqual([]);
  });

  it('is case-insensitive', () => {
    const lower = bm25Rank('music power', [
      { id: 'x', text: 'the power of music' },
    ]);
    const upper = bm25Rank('MUSIC POWER', [
      { id: 'x', text: 'THE POWER OF MUSIC' },
    ]);
    expect(lower[0].score).toBeCloseTo(upper[0].score);
  });
});

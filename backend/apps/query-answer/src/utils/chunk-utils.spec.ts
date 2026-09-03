import { dedupeChunks } from './chunk-utils';
import type { RetrievedChunk } from '../models/retrieved-chunk';

function chunk(url: string, chunkIndex: number, score: number): RetrievedChunk {
  return { text: `text for ${url}#${chunkIndex}`, url, chunkIndex, score };
}

describe('dedupeChunks', () => {
  it('keeps the first occurrence of a chunk with the same url+chunkIndex and drops later ones', () => {
    const first = chunk('https://example.com/a', 0, 0.9);
    const laterDuplicate = chunk('https://example.com/a', 0, 0.1);

    const result = dedupeChunks([first, laterDuplicate]);

    expect(result).toEqual([first]);
  });

  it('treats different chunkIndex values on the same url as distinct chunks', () => {
    const a = chunk('https://example.com/a', 0, 0.5);
    const b = chunk('https://example.com/a', 1, 0.5);

    expect(dedupeChunks([a, b])).toEqual([a, b]);
  });

  it('returns an empty array for an empty input', () => {
    expect(dedupeChunks([])).toEqual([]);
  });
});

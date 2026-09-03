import { buildAnsweringUserPrompt } from './prompts';
import type { RetrievedChunk } from '../models/retrieved-chunk';

function chunk(url: string, text: string): RetrievedChunk {
  return { text, url, chunkIndex: 0, score: 1 };
}

describe('buildAnsweringUserPrompt', () => {
  it('numbers and sources each chunk, ending with the question', () => {
    const prompt = buildAnsweringUserPrompt('what is this about?', [
      chunk('https://example.com/a', 'first chunk text'),
      chunk('https://example.com/b', 'second chunk text'),
    ]);

    expect(prompt).toContain(
      '[1] (source: https://example.com/a)\nfirst chunk text',
    );
    expect(prompt).toContain(
      '[2] (source: https://example.com/b)\nsecond chunk text',
    );
    expect(prompt).toContain('Question: what is this about?');
  });

  it('falls back to a no-content message when no chunks were retrieved', () => {
    const prompt = buildAnsweringUserPrompt('anything', []);

    expect(prompt).toContain('No content was retrieved from the crawl');
    expect(prompt).toContain('Question: anything');
  });
});

export interface Bm25Document {
  id: string;
  text: string;
}

export interface Bm25Result {
  id: string;
  score: number;
}

// Standard Okapi BM25 tuning constants.
const K1 = 1.5;
const B = 0.75;

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Okapi BM25 term-overlap ranking. See docs/planning/04-retrieval-quality-plan.md. */
export function bm25Rank(
  query: string,
  documents: Bm25Document[],
): Bm25Result[] {
  const queryTerms = tokenize(query);
  if (documents.length === 0 || queryTerms.length === 0) {
    return documents.map((doc) => ({ id: doc.id, score: 0 }));
  }

  const docTokens = documents.map((doc) => tokenize(doc.text));
  const docLengths = docTokens.map((tokens) => tokens.length);
  const avgDocLength =
    docLengths.reduce((sum, len) => sum + len, 0) / documents.length;

  const docFrequency = new Map<string, number>();
  for (const tokens of docTokens) {
    for (const term of new Set(tokens)) {
      docFrequency.set(term, (docFrequency.get(term) ?? 0) + 1);
    }
  }

  const uniqueQueryTerms = new Set(queryTerms);
  const idf = new Map<string, number>();
  for (const term of uniqueQueryTerms) {
    const df = docFrequency.get(term) ?? 0;
    // idf+1 variant, floored at 0 so it never goes negative.
    idf.set(
      term,
      Math.max(0, Math.log((documents.length - df + 0.5) / (df + 0.5) + 1)),
    );
  }

  return documents.map((doc, i) => {
    const termFrequency = new Map<string, number>();
    for (const term of docTokens[i]) {
      termFrequency.set(term, (termFrequency.get(term) ?? 0) + 1);
    }

    let score = 0;
    for (const term of uniqueQueryTerms) {
      const tf = termFrequency.get(term) ?? 0;
      if (tf === 0) continue;
      const termIdf = idf.get(term) ?? 0;
      const numerator = tf * (K1 + 1);
      const denominator =
        tf + K1 * (1 - B + (B * docLengths[i]) / avgDocLength);
      score += termIdf * (numerator / denominator);
    }

    return { id: doc.id, score };
  });
}

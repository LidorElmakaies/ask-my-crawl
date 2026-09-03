# Query/Answer retrieval quality — design

Why AnsweringService's retrieval step (`backend/apps/query-answer`) does multi-query expansion and
dual-modality (dense + lexical) RRF fusion instead of a single embedding search. Referenced from
`services.md`'s Query/Answer Service section.

## 1. The bug that prompted this

Reported: a crawl of `books.toscrape.com`, asked "what book does this describe: irresistible
adventure and an impassioned argument about music's liberating, life-affirming power" (the correct
answer, verbatim from the site, is *How Music Works*), came back wrong or with "no answer found" on
different runs.

Reproduced end to end against the live stack (real crawl, real Qdrant, real LM Studio). The system
answered *This Is Your Brain on Music* — a different, real book on the same site — confidently and
wrong. Isolating the cause:

- The correct chunk **was** indexed correctly; it contains the exact phrase from the question,
  verbatim.
- Replaying the same query embedding directly against Qdrant showed the correct chunk ranked
  **outside the single-query top-5** (score 0.7230), narrowly beaten by four chunks from unrelated
  self-help/spirituality books (0.7338–0.7601) that were closer on general "life/meaning" *topic*
  similarity than the correct chunk was on *this specific wording*.
- The LLM never saw the right chunk. It answered honestly from what it was given — the failure was
  entirely retrieval, not the prompt or the model.

This is a **vocabulary/lexical-overlap mismatch**: dense embeddings score meaning, not exact
wording, and at this margin (a ~1.5% score gap deciding rank 4 vs. rank 6) a single phrasing's
embedding search is not reliable enough on its own.

## 2. Design

Two independent techniques, chosen to attack two different parts of the same failure class, not
just this one query:

**Multi-query expansion** — one phrasing of a question is a narrow probe into embedding space; a
paraphrase can land closer to the right chunk even when the original doesn't. `IQueryExpander`
generates `QUERY_EXPANSION_COUNT` (2) rewrites via the same LLM used for answering (own scoped
client, independently swappable), diversified on purpose rather than both "simplified/generic":

1. a broader paraphrase, different vocabulary
2. a variant that preserves the original's distinctive/unusual words verbatim, restructured

Diversity was a deliberate choice over uniform genericization — all-generic rewrites risk drifting
into the *same* wrong neighborhood the original did (they're scored by the same embedding model's
same blind spot), which would have added votes for the wrong answer in this exact reproduction
rather than fixing it. The **original query is always included as a third variant, never dropped**
— sometimes it's already the best phrasing. Expansion never fails the job: any error (LLM
unreachable, unparseable output) falls back to `[originalQuery]` alone.

**Hybrid retrieval (dense + lexical)** — this specific bug was a lexical-overlap miss: the correct
chunk shares rare, distinctive words with the query almost verbatim. A keyword/BM25 search would
have ranked it near #1 on term overlap alone, independent of the topic-similarity noise that misled
the dense search. `ILexicalRetriever` runs Okapi BM25 in-process over the job's chunk set (fetched
once via a `job_id`-scoped Qdrant scroll, no separate search engine — a single job's crawl is small
enough that re-scoring in memory per query is cheap; standing up Postgres full-text search or
Qdrant's sparse-vector support wasn't justified for one additional signal at this scale).

**Fusion — two-stage RRF, not one flat pass.** All 3 query variants (original + 2 rewrites) are
searched through both retrievers, giving 3 dense-ranked lists and 3 lexical-ranked lists. Each
modality's own 3 lists are fused with Reciprocal Rank Fusion (Cormack, Clarke & Buettcher, 2009) —
rank-based, not raw-score-based, which is what makes it valid to combine cosine similarity and BM25
scores without normalizing them onto a shared scale — independently, each kept to its own top
`FUSION_TOP_K_PER_MODALITY` (5). The two top-5s are then merged and deduped by (`url`, chunk index).

Two-stage (fuse within modality, merge after) was chosen over fusing all 6 lists together in one RRF
pass specifically to **guarantee representation from both modalities** in the final context. A flat
pass has no such guarantee — if, say, all 3 rewrites still share literal keywords with the original
(likely, given rewrite (2) above is keyword-preserving by design), BM25 could sweep every top rank
across every variant and crowd dense candidates out of the final 10 entirely. Reserving 5 slots per
modality makes that structurally impossible.

## 3. What this doesn't do (yet)

- **No cross-encoder reranking.** RRF fusion improves recall (getting the right chunk into the
  candidate set at all) but the final ordering within the fused top-10 is still rank-driven, not a
  learned relevance judgment. A reranking pass over the fused candidates is a natural next step if
  precision (not just recall) turns out to still be a problem, but adds another model call and
  latency — deferred until there's evidence multi-query + hybrid alone isn't enough.
- **No persistent lexical index.** BM25 recomputes idf over the job's chunk set on every call rather
  than maintaining an inverted index across jobs — correct because retrieval is always `job_id`-
  scoped anyway (idf computed over other jobs' chunks would be meaningless noise), and cheap at this
  project's per-job chunk counts. Would need revisiting if a single job's crawl grows large enough
  that the scroll-and-score pass becomes the retrieval bottleneck.
- **`RETRIEVAL_TOP_K` (15), `FUSION_TOP_K_PER_MODALITY` (5), and `RRF_K` (60) are unmeasured
  defaults** — same caveat the pre-existing `RETRIEVAL_TOP_K` value already carried ("not tuned
  against real answer quality yet"), still true now that it means something slightly different (a
  per-variant, per-modality candidate pool feeding fusion, not the final chunk count).

// Domain layer — pure data shape, no framework dependencies, no behavioral contract. Not to be
// confused with application/interfaces/ or infrastructure/interfaces/, which hold `I<Thing>`
// interfaces implemented by classes. This is just "what a job looks like." Mirrors data-model.md's
// `jobs` table exactly.
export interface Job {
  id: string;
  user_id: string;
  url: string;
  query: string;
  /** NULL until Query/Answer's answer comes back (answer-ready). */
  result: string | null;
  /** Set when Query/Answer gives up (answer-ready with failed_reason); cleared on retry/success. */
  failed_reason: string | null;
}

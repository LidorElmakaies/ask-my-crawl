import {
  IsNotEmpty,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

// Mirrors frontend/src/utils/validation.js's getQueryError — this is the enforcement boundary
// (the frontend check is only a UX convenience, easily skipped by calling POST /jobs directly), so
// the two must be kept in sync by hand, same as the password-rule duplication between
// register.dto.ts and the frontend's PASSWORD_REQUIREMENTS_HINT.
export const MAX_QUERY_LENGTH = 500;

// Allowlist, not a blocklist: rejects anything outside plain English/Hebrew letters, digits, and
// basic punctuation, which is what actually stops Unicode smuggling into the RAG prompt (invisible
// Unicode Tag characters hidden inside/after an emoji, zero-width joiners, bidi overrides,
// look-alike characters from other scripts) — not just the specific tricks named here. ֐-׿
// is the Hebrew block (letters, niqqud, geresh/gershayim); it deliberately does NOT reach into
// General Punctuation, so LRM/RLM/bidi-embedding characters stay excluded even though real RTL text
// normally relies on them — an accepted tradeoff, not an oversight.
const QUERY_CHAR_RE = /^[A-Za-z0-9֐-׿ .,?!'"()\-:;%/&\n\r]*$/;

export class CreateJobRequestDto {
  @IsNotEmpty()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  url!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(MAX_QUERY_LENGTH)
  @Matches(QUERY_CHAR_RE, {
    message:
      'query must contain only English or Hebrew letters, numbers, and basic punctuation',
  })
  query!: string;
}

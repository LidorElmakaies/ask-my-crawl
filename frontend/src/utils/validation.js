// Pure field-validation helpers — no Redux/React knowledge, same "no I/O, no store access"
// boundary the services layer follows. Shared between login.js and register.js so the email
// check isn't duplicated per screen.

// Phone validation lives in phoneCountries.js — a generic digit-count check let real-looking-but-
// wrong numbers through (e.g. an 11-digit "Israeli" number when real ones are always 10), so it's
// validated per-country instead. See src/utils/phoneCountries.js.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SPECIAL_CHAR_RE = /[!@#$%^&*()\-_+=]/;

export function isValidEmail(email) {
  return EMAIL_RE.test(email.trim());
}

export const PASSWORD_REQUIREMENTS_HINT =
  'At least 8 characters, with an uppercase letter, a number, and a special character (e.g. !@#$%^&*)';

// Returns null when the password satisfies every rule, otherwise the requirements hint to show
// as the field's error text. One combined message rather than one-error-at-a-time — the user sees
// the full bar to clear instead of clearing hurdles one at a time on repeated submits.
export function getPasswordError(password) {
  const meetsAll =
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    SPECIAL_CHAR_RE.test(password);
  return meetsAll ? null : PASSWORD_REQUIREMENTS_HINT;
}

// UX only — the real boundary is CreateJobRequestDto on the Gateway (the only externally-reachable
// service, see root CLAUDE.md), which enforces the same two rules server-side and must be kept in
// sync with these by hand. This is what lets scraper.js show an error the instant the field goes
// invalid, before the user ever hits Send.
export const MAX_QUERY_LENGTH = 500;

// Allowlist, not a blocklist: English/Hebrew letters, digits, and basic punctuation only. This is
// what actually blocks Unicode-smuggling prompt injection (invisible Unicode Tag characters carried
// on an emoji, zero-width joiners, bidi overrides, look-alike characters from other scripts) from
// reaching the RAG prompt — anything outside the allowed set is rejected, not just the specific
// tricks named here. ֐-׿ is the Hebrew block (letters, niqqud, geresh/gershayim) — it
// deliberately does NOT reach into General Punctuation, so LRM/RLM/bidi-embedding characters stay
// excluded even though real RTL text normally relies on them; that's an accepted tradeoff, not an
// oversight. See docs/planning/01-architecture-notes.md §7.
const QUERY_CHAR_RE = /^[A-Za-z0-9֐-׿ .,?!'"()\-:;%/&\n\r]*$/;

export const QUERY_CHARSET_HINT =
  'English or Hebrew letters, numbers, and basic punctuation only — no emoji or other scripts.';

// Returns null once the query satisfies every rule, otherwise the hint to show — same
// one-combined-message shape as getPasswordError. Emptiness is deliberately not an error here;
// callers gate submit on a separate non-empty check so an untouched field doesn't open red.
export function getQueryError(query) {
  if (!query) return null;
  if (query.length > MAX_QUERY_LENGTH) {
    return `Keep it under ${MAX_QUERY_LENGTH} characters (${query.length}/${MAX_QUERY_LENGTH}).`;
  }
  if (!QUERY_CHAR_RE.test(query)) {
    return QUERY_CHARSET_HINT;
  }
  return null;
}

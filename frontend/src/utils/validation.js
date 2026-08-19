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

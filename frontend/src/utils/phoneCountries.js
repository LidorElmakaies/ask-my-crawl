// Per-country phone validation. A generic "7-15 digits" check let clearly-wrong numbers through
// (e.g. an 11-digit Israeli number when real Israeli mobiles are always exactly 10) because it
// had no idea what a valid number for any given country actually looks like.
//
// Add a country by adding an entry here — nothing else needs to change. Each entry owns its own
// national-number shape; don't assume other countries share Israel's format.

export const PHONE_COUNTRIES = [
  {
    code: 'IL',
    name: 'Israel',
    flag: '🇮🇱',
    callingCode: '972',
    // National significant number: a 2-digit mobile carrier prefix (50/51/52/53/54/55/58) + 7
    // digits — 9 digits total, entered here WITHOUT the leading domestic trunk '0'. The country
    // selector already shows +972, and +972 replaces that '0' — the same number is written
    // "+972 52 242 3999" internationally, not "+972 052 242 3999". A leading 0 is REJECTED, not
    // silently stripped — a prior version tolerated it, which meant the field displayed +972 and
    // a locally-formatted 0522423999 side by side with no visible connection between them; the
    // field only ever wants the national number in the form that's actually being appended to
    // the calling code.
    nationalPattern: /^(50|51|52|53|54|55|58)\d{7}$/,
    // Generic placeholder text only — illustrates the field's length/shape, not a real number.
    // Dash-grouped 2-3-4 to actually read as a phone number (matching the real prefix+subscriber
    // shape) rather than a bare run of digits. Won't itself pass nationalPattern (doesn't start
    // with a real carrier prefix); that's fine, it's cosmetic, not a validation fixture.
    example: '12-345-6789',
    // Same 2-3-4 shape as the example above, and the live-formatting groups below.
    groups: [2, 3, 4],
    maxDigits: 9,
    normalize: (rawInput) => rawInput.replace(/\D/g, ''),
  },
];

export const DEFAULT_PHONE_COUNTRY = PHONE_COUNTRIES[0];

export function isValidPhoneForCountry(country, rawInput) {
  return country.nationalPattern.test(country.normalize(rawInput));
}

// Live input formatting: dashes get inserted between digit groups as you type (12 -> 12-3 ->
// 12-345 -> 12-345-6789), and removed again as digits are deleted. Always rebuilt from the
// DIGITS ONLY, never edited in place — so a dash can never be independently deleted (with the
// keyboard or by selecting just the dash with the mouse): whatever separators were in the input
// text are discarded and correct ones are reinserted from the remaining digits every time. That
// also means backspacing across a group boundary drops the trailing dash for free, no special
// key handling needed.
export function formatNationalNumber(country, rawInput) {
  const digits = country.normalize(rawInput).slice(0, country.maxDigits);
  let formatted = '';
  let i = 0;
  for (const size of country.groups) {
    if (i >= digits.length) break;
    if (formatted) formatted += '-';
    formatted += digits.slice(i, i + size);
    i += size;
  }
  return formatted;
}

// E.164: "+" + calling code + national significant number, e.g. "+972522423999".
export function toE164(country, rawInput) {
  return `+${country.callingCode}${country.normalize(rawInput)}`;
}

// A specific message for the single most likely mistake (typing the locally-familiar leading 0
// on top of an already-selected country code) instead of a generic "invalid number" for it —
// every other kind of invalid input still gets the generic message.
export function getPhoneErrorMessage(country, rawInput) {
  const digits = country.normalize(rawInput);
  if (country.code === 'IL' && digits.length === 10 && digits.startsWith('0')) {
    return `Drop the leading 0 — +${country.callingCode} already replaces it (e.g. ${country.example})`;
  }
  return `Enter a valid ${country.name} number (e.g. ${country.example})`;
}

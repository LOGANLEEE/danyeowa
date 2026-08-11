/**
 * Normalises a flight number so `EK049` and `EK49` compare/key equal: uppercases, trims
 * surrounding whitespace, and strips leading zeros from the numeric part (keeping at least
 * one digit). Only touches strings matching the `[A-Z]{2}\d{1,4}` shape (case-insensitive,
 * incidental internal whitespace tolerated before the check) - anything else is returned
 * trimmed+uppercased but otherwise untouched, since mangling a value that doesn't fit the
 * shape would be worse than leaving it for the existing regex validators to reject.
 */
export function normaliseFlightNo(raw: string): string {
  const upper = raw.trim().toUpperCase().replace(/\s+/g, "");
  const match = /^([A-Z]{2})(\d{1,4})$/.exec(upper);
  if (!match) return upper;
  const [, prefix, digits] = match;
  const stripped = digits!.replace(/^0+(?=\d)/, "");
  return `${prefix}${stripped}`;
}

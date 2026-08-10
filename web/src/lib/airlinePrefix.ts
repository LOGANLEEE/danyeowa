const STORAGE_KEY = "roster-airline-prefix";

export const DEFAULT_AIRLINE_PREFIX = "EK";

const VALID_PREFIX = /^[A-Z]{2}$/;

/** Reads the persisted two-letter IATA airline code. Falls back to "EK" if unset, invalid,
 * or storage throws (e.g. private-mode WebKit). */
export function getAirlinePrefix(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && VALID_PREFIX.test(stored) ? stored : DEFAULT_AIRLINE_PREFIX;
  } catch {
    return DEFAULT_AIRLINE_PREFIX;
  }
}

/** Persists the airline code prefix, uppercased. No-ops on anything that isn't two letters -
 * garbage in storage must not break flight-number entry. */
export function setAirlinePrefix(prefix: string): void {
  const upper = prefix.toUpperCase();
  if (!VALID_PREFIX.test(upper)) return;
  try {
    localStorage.setItem(STORAGE_KEY, upper);
  } catch {
    // ignore
  }
}

/** The typed part of a flight number: everything after the configured airline code. A value
 * that doesn't carry the prefix (e.g. after the setting changed) is shown as-is rather than
 * silently truncated. */
export function digitsOf(flightNo: string, prefix: string): string {
  return flightNo.startsWith(prefix) ? flightNo.slice(prefix.length) : flightNo;
}

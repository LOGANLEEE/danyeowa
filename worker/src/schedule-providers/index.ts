import type { ProviderLeg } from "@roaster/shared";
import type { Env } from "../index";
import { Fr24ScrapeProvider } from "./scrape-fr24";
import { AeroDataBoxProvider } from "./aerodatabox";

/**
 * What a provider actually learned. The three cases have to stay apart, because the caller
 * negative-caches an answer and must never cache a non-answer:
 *
 * - `legs`        — the flight exists, and here it is
 * - `absent`      — the provider answered, and has no such flight
 * - `unavailable` — the provider could not answer: blocked, timed out, no API key
 *
 * Collapsing the last two into `null` is what made EK247 unresolvable for a whole TTL. The
 * scraper was being served a bot-challenge page, the chain read that as "no such flight", and
 * the resulting miss row shadowed a real daily A380 service until it expired.
 */
export type ProviderOutcome =
  | { status: "legs"; legs: ProviderLeg[] }
  | { status: "absent" }
  | { status: "unavailable"; reason: string };

/** A source of live flight schedule data (scraper, API, ...). */
export interface ScheduleProvider {
  name: string;
  /**
   * Resolves `flightNo`'s schedule legs for `dateIso` ("YYYY-MM-DD"). Must never throw for an
   * ordinary miss — return `absent` or `unavailable` instead; only truly unexpected errors
   * should reject (`resolveFromProviders` catches those too, and counts them unavailable).
   */
  fetchFlight(flightNo: string, dateIso: string, signal: AbortSignal): Promise<ProviderOutcome>;
}

export type ResolvedSchedule = {
  legs: ProviderLeg[];
  source: "live-scrape" | "live-api";
};

/**
 * The chain's verdict. `absent` only when EVERY provider answered and none had the flight —
 * one provider that could not answer is enough to make the whole outcome unavailable, since
 * the flight may well exist behind it.
 */
export type ChainOutcome =
  | { status: "resolved"; schedule: ResolvedSchedule }
  | { status: "absent" }
  | { status: "unavailable"; reason: string };

/** Per-provider hard timeout. Total chain budget is bounded by trying providers in
 * sequence (scraper then API), so worst case is roughly 2x this value - comfortably
 * under the plan's 10s total budget. */
const PROVIDER_TIMEOUT_MS = 6_000;

/**
 * Tries each provider in priority order (scraper, then API) until one resolves legs or
 * all are exhausted. Each provider gets its own `PROVIDER_TIMEOUT_MS` AbortSignal; a
 * timeout (or any other failure) is treated as a miss and the chain moves on - it NEVER
 * propagates a provider error to the caller, since a cache-miss lookup must fail soft to
 * manual entry rather than 500.
 *
 * `deps` is injectable so tests can supply fixture-backed providers instead of the real
 * scraper/API ones (which hit the network) - see `resolveFromProviders` unit tests.
 */
export async function resolveFromProviders(
  flightNo: string,
  dateIso: string,
  env: Env,
  deps?: { providers?: ScheduleProvider[] },
): Promise<ChainOutcome> {
  const providers = deps?.providers ?? [new Fr24ScrapeProvider(), new AeroDataBoxProvider(env)];
  const unavailable: string[] = [];

  for (const provider of providers) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
      const outcome = await provider.fetchFlight(flightNo, dateIso, controller.signal);
      if (outcome.status === "legs" && outcome.legs.length > 0) {
        const source = provider.name === "aerodatabox" ? "live-api" : "live-scrape";
        return { status: "resolved", schedule: { legs: outcome.legs, source } };
      }
      if (outcome.status === "unavailable") unavailable.push(`${provider.name}: ${outcome.reason}`);
    } catch (e) {
      // An uncaught failure says nothing about whether the flight exists, so it counts as
      // unavailable rather than as evidence of absence.
      unavailable.push(`${provider.name}: threw ${String(e).slice(0, 60)}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  if (unavailable.length > 0) return { status: "unavailable", reason: unavailable.join("; ") };
  return { status: "absent" };
}

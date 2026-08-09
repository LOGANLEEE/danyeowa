import type { ProviderLeg } from "@roaster/shared";
import type { Env } from "../index";
import { Fr24ScrapeProvider } from "./scrape-fr24";
import { AeroDataBoxProvider } from "./aerodatabox";

/** A source of live flight schedule data (scraper, API, ...). */
export interface ScheduleProvider {
  name: string;
  /**
   * Resolves `flightNo`'s schedule legs for `dateIso` ("YYYY-MM-DD"). Returns `null` when
   * the provider has no data (not found, blocked, missing config) or the request is
   * aborted via `signal` — callers treat `null` exactly like a miss and move to the next
   * provider in the chain. Must never throw for an ordinary miss; only truly unexpected
   * errors should reject (`resolveFromProviders` catches those too, as a last resort).
   */
  fetchFlight(flightNo: string, dateIso: string, signal: AbortSignal): Promise<ProviderLeg[] | null>;
}

export type ResolvedSchedule = {
  legs: ProviderLeg[];
  source: "live-scrape" | "live-api";
};

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
): Promise<ResolvedSchedule | null> {
  const providers = deps?.providers ?? [new Fr24ScrapeProvider(), new AeroDataBoxProvider(env)];

  for (const provider of providers) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
      const legs = await provider.fetchFlight(flightNo, dateIso, controller.signal);
      if (legs && legs.length > 0) {
        const source = provider.name === "aerodatabox" ? "live-api" : "live-scrape";
        return { legs, source };
      }
    } catch {
      // Any provider failure (network error, parse error, uncaught abort) is a miss -
      // fall through to the next provider rather than surfacing a 500 to the caller.
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

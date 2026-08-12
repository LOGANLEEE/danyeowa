import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { Fr24ScrapeProvider } from "../../src/schedule-providers/scrape-fr24";

/**
 * Hits the REAL flightradar24 flight page over the network. Skipped by default (in CI
 * and local `pnpm test`) - opt in with `LIVE_PROVIDER_TEST=1 pnpm test` to re-verify the
 * scraper against the live page shape (e.g. after fr24 changes their markup).
 *
 * Reads the opt-in flag via the Miniflare `env` binding (threaded through from
 * `process.env` in vitest.config.ts), NOT `process.env` directly - tests run inside the
 * workerd sandbox, which does not inherit the invoking shell's environment.
 */
describe.skipIf(!(env as { LIVE_PROVIDER_TEST?: string }).LIVE_PROVIDER_TEST)("Fr24ScrapeProvider (live network)", () => {
  it("resolves EK372 to DXB->BKK from the real flightradar24 page", async () => {
    const provider = new Fr24ScrapeProvider();
    const outcome = await provider.fetchFlight("EK372", "2026-08-17", new AbortController().signal);
    // A blocked run must be visibly different from "no such flight" — that distinction is the
    // whole point of the outcome type, and this live test is where it shows up first.
    expect(outcome.status).toBe("legs");
    expect(outcome.status === "legs" && outcome.legs[0]).toMatchObject({ origin: "DXB", dest: "BKK" });
  });
});

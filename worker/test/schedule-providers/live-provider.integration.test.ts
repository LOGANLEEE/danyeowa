import { describe, expect, it } from "vitest";
import { Fr24ScrapeProvider } from "../../src/schedule-providers/scrape-fr24";

/**
 * Hits the REAL flightradar24 flight page over the network. Skipped by default (in CI
 * and local `pnpm test`) - opt in with `LIVE_PROVIDER_TEST=1 pnpm test` to re-verify the
 * scraper against the live page shape (e.g. after fr24 changes their markup).
 */
describe.skipIf(!process.env.LIVE_PROVIDER_TEST)("Fr24ScrapeProvider (live network)", () => {
  it("resolves EK372 to DXB->BKK from the real flightradar24 page", async () => {
    const provider = new Fr24ScrapeProvider();
    const legs = await provider.fetchFlight("EK372", "2026-08-17", new AbortController().signal);
    expect(legs).not.toBeNull();
    expect(legs?.[0]).toMatchObject({ origin: "DXB", dest: "BKK" });
  });
});

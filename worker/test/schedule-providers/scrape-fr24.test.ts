import { describe, expect, it } from "vitest";
import { parseFr24Html, Fr24ScrapeProvider } from "../../src/schedule-providers/scrape-fr24";
import { fr24Ek372Html } from "../fixtures/fr24-ek372";

describe("parseFr24Html", () => {
  it("parses the EK372 fixture to DXB->BKK (proving the seeded DXB->TPE row wrong)", async () => {
    const res = new Response(fr24Ek372Html);
    const leg = await parseFr24Html(res);
    expect(leg).not.toBeNull();
    expect(leg).toMatchObject({
      origin: "DXB",
      dest: "BKK",
      depLocal: "09:40",
      arrLocal: "19:25",
    });
    // Same-day arrival (dep 09:40 Asia/Dubai -> arr 19:25 Asia/Bangkok, ~6h flight, no
    // midnight crossing in either local calendar).
    expect(leg?.dayOffset).toBe(0);
    // The fr24 page shows one row per calendar date, not a weekly pattern, so the
    // scraper can't derive an operating-day pattern from a single fetch.
    expect(leg?.daysOfWeek).toBeUndefined();
  });

  it("returns null for a page with no data-row table (e.g. an error/blocked page)", async () => {
    const res = new Response("<html><body>Not found</body></html>");
    const leg = await parseFr24Html(res);
    expect(leg).toBeNull();
  });

  it("returns null when airport links are missing but times are present", async () => {
    const html = `<tr class=" data-row"><td class="hidden-xs hidden-sm" data-timestamp="1786945200" data-offset="14400">9:40 AM</td><td class="hidden-xs hidden-sm" data-timestamp="1786969500" data-offset="25200">7:25 PM</td></tr>`;
    const leg = await parseFr24Html(new Response(html));
    expect(leg).toBeNull();
  });

  it("only parses the FIRST data-row when the page has multiple", async () => {
    // Second row (04 Aug) has different times/aircraft than the first (17 Aug) in the real
    // fixture - if the parser accidentally consumed the second row's cells too, the times
    // would no longer match the first row's STD/STA pair asserted above. Reuse of the same
    // fixture already covers this implicitly (its later rows exist and are ignored), but
    // this test makes the "first row only" contract explicit and independent of fixture
    // content specifics.
    const res = new Response(fr24Ek372Html);
    const leg = await parseFr24Html(res);
    expect(leg?.depLocal).toBe("09:40"); // 17 Aug row's STD, not any later row's.
  });
});

describe("Fr24ScrapeProvider", () => {
  it("returns null when fetch throws (network error / abort)", async () => {
    const provider = new Fr24ScrapeProvider();
    const controller = new AbortController();
    controller.abort();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.reject(new Error("aborted"));
    try {
      const legs = await provider.fetchFlight("EK372", "2026-08-17", controller.signal);
      expect(legs).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns null on a non-ok response", async () => {
    const provider = new Fr24ScrapeProvider();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.resolve(new Response("blocked", { status: 403 }));
    try {
      const legs = await provider.fetchFlight("EK372", "2026-08-17", new AbortController().signal);
      expect(legs).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("parses a successful response into a single-leg array", async () => {
    const provider = new Fr24ScrapeProvider();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.resolve(new Response(fr24Ek372Html));
    try {
      const legs = await provider.fetchFlight("EK372", "2026-08-17", new AbortController().signal);
      expect(legs).toHaveLength(1);
      expect(legs?.[0]).toMatchObject({ origin: "DXB", dest: "BKK" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

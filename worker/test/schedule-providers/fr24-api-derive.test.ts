import { describe, expect, it } from "vitest";
// @ts-expect-error - plain .mjs helper shared with scripts/, no type declarations
import { deriveAirports, deriveLegSchedule, groupServices, toLeg } from "../../../scripts/lib/fr24-api.mjs";
import fixture from "../fixtures/fr24-api-ek247.json";

/**
 * Against a real captured response. Each assertion here is a bug the HTML scraper actually
 * shipped — wrong leg order on a midnight-crossing service, a daily flight marked as operating
 * three days a week, and a two-leg service reduced to one leg.
 */
describe("deriveLegSchedule from the fr24 flight-list API", () => {
  it("keeps both legs of EK247 in flying order", () => {
    const legs = deriveLegSchedule(fixture.ek247);
    expect(legs).toHaveLength(2);
    expect(legs[0]).toMatchObject({ legSeq: 0, origin: "DXB", dest: "GIG" });
    expect(legs[1]).toMatchObject({ legSeq: 1, origin: "GIG", dest: "EZE" });
  });

  it("orders EK248 by departure, not by local clock", () => {
    // EZE departs 22:25 local and GIG departs 03:05 local, so sorting on the clock inverts them.
    const legs = deriveLegSchedule(fixture.ek248);
    expect(legs[0]).toMatchObject({ origin: "EZE", dest: "GIG" });
    expect(legs[1]).toMatchObject({ origin: "GIG", dest: "DXB" });
  });

  it("treats a near-daily service as daily", () => {
    for (const leg of deriveLegSchedule(fixture.ek247)) {
      expect(leg.daysOfWeek).toBe("1234567");
    }
  });

  it("reads EK1 as a single London leg", () => {
    const legs = deriveLegSchedule(fixture.ek1);
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ origin: "DXB", dest: "LHR" });
  });

  it("returns nothing for a flight the API has no data for", () => {
    expect(deriveLegSchedule([])).toEqual([]);
  });
});

describe("toLeg", () => {
  const item = (depEpoch: number, arrEpoch: number, offset: number) => ({
    identification: { number: { default: "EK9999" } },
    airport: {
      origin: { code: { iata: "DXB" }, timezone: { name: "Asia/Dubai", offset: 14400 } },
      destination: { code: { iata: "SYD" }, timezone: { name: "Australia/Sydney", offset } },
    },
    time: { scheduled: { departure: depEpoch, arrival: arrEpoch } },
  });

  it("converts each end to its own local clock", () => {
    // 2026-08-20T02:00Z departs Dubai at 06:00 (+4) and lands Sydney 2026-08-20T22:00Z = 08:00
    // the NEXT day (+10).
    const leg = toLeg(item(Date.parse("2026-08-20T02:00:00Z") / 1000, Date.parse("2026-08-20T22:00:00Z") / 1000, 36000));
    expect(leg).toMatchObject({ depLocal: "06:00", arrLocal: "08:00", dayOffset: 1 });
  });

  it("expresses a two-day offset, which the old arrival<departure test could not", () => {
    // Departs Dubai 2026-08-20 14:00 (+4), lands Sydney 2026-08-22 11:00 (+10): two local dates on.
    const leg = toLeg(item(Date.parse("2026-08-20T10:00:00Z") / 1000, Date.parse("2026-08-22T01:00:00Z") / 1000, 36000));
    expect(leg?.dayOffset).toBe(2);
  });

  it("drops an item with no scheduled times", () => {
    expect(toLeg(item(0, 0, 36000))).toBeNull();
  });
});

describe("groupServices", () => {
  it("splits consecutive days into separate services", () => {
    const legs = fixture.ek247.map(toLeg).filter(Boolean);
    const services = groupServices(legs);
    expect(services.length).toBeGreaterThan(1);
    for (const service of services) {
      // Every service is a connected chain: each leg starts where the previous one ended.
      for (let i = 1; i < service.length; i++) {
        expect(service[i].origin).toBe(service[i - 1].dest);
      }
    }
  });
});

describe("deriveAirports", () => {
  it("returns a row per airport the flight touches, with a real IANA timezone", () => {
    const airports = deriveAirports(fixture.ek247);
    const byIata = Object.fromEntries(airports.map((a: any) => [a.iata, a]));
    expect(Object.keys(byIata).sort()).toEqual(["DXB", "EZE", "GIG"]);
    expect(byIata.GIG).toMatchObject({ city: "Rio de Janeiro", tz: "America/Sao_Paulo" });
  });

  it("skips an airport with no timezone rather than inventing one", () => {
    // A fabricated tz silently computes wrong report times everywhere downstream, so a missing
    // one has to drop the airport — the lookup already degrades gracefully when a code is absent.
    const items = [
      {
        airport: {
          origin: { code: { iata: "AAA" }, name: "No Timezone", timezone: {} },
          destination: {
            code: { iata: "BBB" },
            name: "Has One",
            position: { region: { city: "Bee" } },
            timezone: { name: "Europe/Paris" },
          },
        },
        time: { scheduled: { departure: 1, arrival: 2 } },
      },
    ];
    expect(deriveAirports(items).map((a: any) => a.iata)).toEqual(["BBB"]);
  });

  it("falls back to the airport name when the feed carries no city", () => {
    const items = [
      {
        airport: {
          origin: { code: { iata: "CCC" }, name: "Lone Field", timezone: { name: "UTC" } },
          destination: { code: { iata: "DDD" }, timezone: {} },
        },
        time: { scheduled: { departure: 1, arrival: 2 } },
      },
    ];
    expect(deriveAirports(items)[0]).toMatchObject({ iata: "CCC", city: "Lone Field", tz: "UTC" });
  });
});

describe("groupServices — rotations", () => {
  /** CRK->DXB->CEB->CRK, repeated daily. Every hop connects, and the cycle never breaks itself. */
  function rotation(days: number) {
    const DAY = 86_400;
    const base = Date.parse("2026-08-12T16:55:00Z") / 1000;
    const items = [];
    for (let d = 0; d < days; d++) {
      const at = base + d * DAY;
      const hop = (fromIata: string, toIata: string, depOffset: number, arrOffset: number) => ({
        airport: {
          origin: { code: { iata: fromIata }, timezone: { name: "UTC", offset: 0 } },
          destination: { code: { iata: toIata }, timezone: { name: "UTC", offset: 0 } },
        },
        time: { scheduled: { departure: at + depOffset, arrival: at + arrOffset } },
      });
      items.push(hop("CRK", "DXB", 0, 15_600));
      items.push(hop("DXB", "CEB", 21_600, 69_900));
      items.push(hop("CEB", "CRK", 75_600, 80_700));
    }
    return items;
  }

  it("starts a new service when the rotation returns to a station it already left", () => {
    // Before this rule EK338 chained day after day into one service with a dozen legs, which
    // the ingest schema then rejected outright — every batch containing it wrote nothing.
    const legs = deriveLegSchedule(rotation(3));
    expect(legs).toHaveLength(3);
    expect(legs.map((l: { origin: string }) => l.origin)).toEqual(["CRK", "DXB", "CEB"]);
  });

  it("keeps leg_seq inside the range the ingest API accepts", () => {
    for (const leg of deriveLegSchedule(rotation(5))) {
      expect(leg.legSeq).toBeLessThanOrEqual(9);
    }
  });

  it("still joins a genuine multi-leg service that does not double back", () => {
    const legs = deriveLegSchedule(fixture.ek247);
    expect(legs).toHaveLength(2);
  });
});

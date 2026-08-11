import { describe, expect, it } from "vitest";
// @ts-expect-error - plain .mjs helper shared with scripts/, no type declarations
import { deriveLegSchedule, groupServices, toLeg } from "../../../scripts/lib/fr24-api.mjs";
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

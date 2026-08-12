import { describe, expect, it } from "vitest";
// @ts-expect-error - plain .mjs script shared with scripts/, no type declarations
import { expandFlights, parseArgs } from "../../../scripts/fetch-schedules.mjs";

/**
 * The harvester's argument handling, which has cost real work twice: a --force run silently
 * erased a 36-flight resume bookmark, and --live-roster has to coexist with the older
 * --flights / --range forms rather than replacing them.
 */
describe("parseArgs", () => {
  it("accepts --live-roster on its own", () => {
    const args = parseArgs(["--live-roster", "--apply"]);
    expect(args.liveRoster).toBe(true);
    expect(args.apply).toBe(true);
  });

  it("still requires a source when none is given", () => {
    expect(() => parseArgs(["--apply"])).toThrow(/--flights|--range|--live-roster/);
  });

  it("keeps the explicit forms working", () => {
    expect(parseArgs(["--flights", "EK247,EK49"]).flights).toBe("EK247,EK49");
    expect(parseArgs(["--range", "1-300"]).range).toBe("1-300");
    expect(parseArgs(["--limit", "20"]).limit).toBe(20);
  });

  it("defaults to dry-run, because --apply writes to production", () => {
    expect(parseArgs(["--live-roster"]).apply).toBe(false);
  });
});

describe("expandFlights", () => {
  it("expands a numeric range", () => {
    expect(expandFlights({ range: "1-4" })).toEqual(["EK1", "EK2", "EK3", "EK4"]);
  });

  it("splits an explicit list", () => {
    expect(expandFlights({ flights: "EK247, EK49 " })).toEqual(["EK247", "EK49"]);
  });

  it("yields nothing for --live-roster, which supplies its list from the feed instead", () => {
    expect(expandFlights({ liveRoster: true })).toEqual([]);
  });
});

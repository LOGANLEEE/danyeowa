import { localDateKey } from "@danyeowa/shared";

/** What a duty day is, relative to home base - drives the calendar cell's arrow glyph so
 * outbound vs return vs turnaround are readable without tapping the day. */
export type DayKind =
  /** Leaves home base and doesn't come back that day. */
  | "outbound"
  /** Lands back at home base. */
  | "return"
  /** Out of home base and back on the same local day. */
  | "turnaround"
  /** Flies between two outstations (no home-base leg). */
  | "sector"
  /** Down-route day with no departure - slip/layover. */
  | "layover";

/** `code` is the station the glyph points at: the outstation reached (outbound/turnaround/
 * sector), the station flown home from (return), or the station slept at (layover). */
export type DayMark = { kind: DayKind; code: string };

type LegLike = { origin: string; dest: string; depUtc: string; arrUtc: string };
type TripLike = { flights: LegLike[] };

/**
 * Classifies each day of a trip span. `spanDays` are the local (in `homeTz`) dates the
 * calendar already marks as trip days - days with no departure fall back to "layover",
 * carrying the station of the last leg that had landed by then.
 */
export function dutyDayMarks(
  trips: readonly TripLike[],
  homeTz: string,
  base: string,
  spanDays: Iterable<string>,
): Map<string, DayMark> {
  const allLegs = trips
    .flatMap((trip) => trip.flights)
    .sort((a, b) => Date.parse(a.depUtc) - Date.parse(b.depUtc));

  const legsByDepDay = new Map<string, LegLike[]>();
  for (const leg of allLegs) {
    const key = localDateKey(leg.depUtc, homeTz);
    const bucket = legsByDepDay.get(key);
    if (bucket) bucket.push(leg);
    else legsByDepDay.set(key, [leg]);
  }

  const marks = new Map<string, DayMark>();
  for (const iso of spanDays) {
    const legs = legsByDepDay.get(iso);

    if (!legs || legs.length === 0) {
      // Layover: where the crew is standing that day = destination of the last leg that had
      // already landed. Only reached for days inside a span, so a leg always precedes it.
      const landed = allLegs.filter((leg) => localDateKey(leg.arrUtc, homeTz) <= iso);
      const last = landed[landed.length - 1];
      if (last) marks.set(iso, { kind: "layover", code: last.dest });
      continue;
    }

    const leavesBase = legs.find((leg) => leg.origin === base);
    const returnsBase = legs.find((leg) => leg.dest === base);
    const lastLeg = legs[legs.length - 1]!;

    if (leavesBase && returnsBase) marks.set(iso, { kind: "turnaround", code: leavesBase.dest });
    else if (leavesBase) marks.set(iso, { kind: "outbound", code: lastLeg.dest });
    else if (returnsBase) marks.set(iso, { kind: "return", code: legs[0]!.origin });
    else marks.set(iso, { kind: "sector", code: lastLeg.dest });
  }

  return marks;
}

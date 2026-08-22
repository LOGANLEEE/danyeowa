import { useEffect, useState } from "react";
import { localDateKey } from "@danyeowa/shared";
import { useAirport } from "./airports";
import { fetchLayoverForecast, type DayForecast } from "./weather";

/** The five fields a card can wear. Grouped from WMO 4677 by what would change what she packs,
 * not by the code's own granularity — "moderate" versus "dense drizzle" is the same card. */
export type SkyKind = "clear" | "cloud" | "rain" | "storm" | "snow";

const SKY_BY_CODE: ReadonlyArray<readonly [readonly number[], SkyKind]> = [
  [[0, 1], "clear"],
  [[2, 3, 45, 48], "cloud"],
  [[51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82], "rain"],
  [[71, 73, 75, 77, 85, 86], "snow"],
  [[95, 96, 99], "storm"],
];

export function skyKind(code: number): SkyKind {
  for (const [codes, kind] of SKY_BY_CODE) if (codes.includes(code)) return kind;
  // An unmapped code is weather we cannot name; "cloud" is the field that claims least.
  return "cloud";
}

/**
 * The destination's forecast for the day this flight lands, or null.
 *
 * Null is the ordinary answer, not an error: forecasts reach about 16 days and a roster runs
 * further, so most cards will never wear a sky. The caller renders the plain card then — never
 * a seasonal stand-in, which is the failure that got weather shelved here in the first place.
 */
export type Sky = { kind: SkyKind; day: DayForecast };

export function useDestinationSky(
  dest: string,
  arrUtc: string,
  arrTz: string,
): Sky | null {
  const airport = useAirport(dest);
  const [sky, setSky] = useState<Sky | null>(null);
  const lat = airport?.lat;
  const lng = airport?.lng;

  useEffect(() => {
    setSky(null);
    if (lat == null || lng == null) return;
    const date = localDateKey(arrUtc, arrTz);
    let cancelled = false;
    void fetchLayoverForecast(lat, lng, arrTz, [date]).then((days) => {
      const day = days?.find((d) => d.date === date);
      if (!cancelled && day) setSky({ kind: skyKind(day.code), day });
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lng, arrUtc, arrTz]);

  return sky;
}

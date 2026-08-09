import type { DrizzleD1Database } from "drizzle-orm/d1";
import scheduleData from "../../../scripts/ek-schedules.json";
import { flightSchedules } from "./schedule-schema";
import type * as schema from "./schema";

export type ScheduleSeed = {
  flightNo: string;
  legSeq: number;
  origin: string;
  dest: string;
  depLocal: string;
  arrLocal: string;
  dayOffset: number;
  daysOfWeek: string;
  /** Always "seed-verified" as of Plan 10 T2 - `scripts/ek-schedules.json` was pruned to
   * ONLY the live-source-verified rows (see drizzle/0007_purge_unverified_seed_schedules.sql
   * and task-2-report.md for the reconciled verified set). Kept as a field here (rather than
   * hardcoded below) so a future seed file could carry a different source if ever needed. */
  source: "seed-verified";
};

const seedData = scheduleData as ScheduleSeed[];

export async function seedSchedules(db: DrizzleD1Database<typeof schema>): Promise<void> {
  const now = Date.now();
  for (const leg of seedData) {
    await db
      .insert(flightSchedules)
      .values({ ...leg, fetchedAt: now })
      .onConflictDoUpdate({
        target: [flightSchedules.flightNo, flightSchedules.legSeq],
        set: {
          origin: leg.origin,
          dest: leg.dest,
          depLocal: leg.depLocal,
          arrLocal: leg.arrLocal,
          dayOffset: leg.dayOffset,
          daysOfWeek: leg.daysOfWeek,
          source: leg.source,
          fetchedAt: now,
        },
      });
  }
}

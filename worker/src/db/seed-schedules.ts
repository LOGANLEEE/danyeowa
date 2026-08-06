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
};

const seedData = scheduleData as ScheduleSeed[];

export async function seedSchedules(db: DrizzleD1Database<typeof schema>): Promise<void> {
  for (const leg of seedData) {
    await db
      .insert(flightSchedules)
      .values(leg)
      .onConflictDoUpdate({
        target: [flightSchedules.flightNo, flightSchedules.legSeq],
        set: {
          origin: leg.origin,
          dest: leg.dest,
          depLocal: leg.depLocal,
          arrLocal: leg.arrLocal,
          dayOffset: leg.dayOffset,
          daysOfWeek: leg.daysOfWeek,
        },
      });
  }
}

import type { DrizzleD1Database } from "drizzle-orm/d1";
import airportsData from "../../../scripts/airports-ek.json";
import { airports } from "./app-schema";
import type * as schema from "./schema";

export type AirportSeed = { iata: string; city: string; name: string; tz: string };

const seedData = airportsData as AirportSeed[];

export async function seedAirports(db: DrizzleD1Database<typeof schema>): Promise<void> {
  for (const airport of seedData) {
    await db
      .insert(airports)
      .values(airport)
      .onConflictDoUpdate({
        target: airports.iata,
        set: { city: airport.city, name: airport.name, tz: airport.tz },
      });
  }
}

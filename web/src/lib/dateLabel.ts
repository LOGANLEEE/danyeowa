import { formatLocal } from "@danyeowa/shared";

/** Humanizes a local ISO calendar date ("YYYY-MM-DD") as "Wed 20 Aug" (weekday short + day
 * + month short) using the home tz's own calendar — reuses formatLocal's withDate branch
 * (weekday/day/month/hour/minute) by feeding it a synthetic noon-UTC instant for that
 * calendar date (noon avoids any tz day-boundary slippage for all realistic offsets), then
 * drops the time portion. */
export function humanDateLabel(isoDate: string, homeTz: string): string {
  return formatLocal(`${isoDate}T12:00:00.000Z`, homeTz, { withDate: true }).split(" ").slice(0, 3).join(" ");
}

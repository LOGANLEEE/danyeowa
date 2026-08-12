/**
 * Turns flightradar24's flight-list JSON into schedule rows.
 *
 * This replaced an HTML scraper, and the reason is worth keeping: the JSON carries UTC epochs
 * plus each airport's timezone offset, so three things the scraper had to *infer* become
 * arithmetic — leg order (sort by departure epoch), local clock times (epoch + offset), and the
 * arrival day offset (compare local dates instead of guessing from "arrival looks earlier").
 * Every one of those inferences had shipped a bug.
 *
 * The endpoint (api.flightradar24.com/common/v1/flight/list.json?query=EK247&fetchBy=flight)
 * only answers from inside a real browser page — a direct request gets a Cloudflare 403 — so
 * the caller still drives Chrome. See scripts/fetch-schedules.mjs.
 */

/**
 * Every airport the response touches, as rows for the `airports` table.
 *
 * Harvesting schedules without this is pointless: the lookup route 404s a flight whose leg
 * references an IATA it has no row for, because it cannot compute a report time without a real
 * timezone and refuses to guess one. Measured on production — 10 unseeded codes made 14 harvested
 * flights unreachable, EK247 among them, while their schedule rows sat in the table looking fine.
 *
 * The tz here is a genuine IANA name straight from the provider, not a derived offset, which is
 * exactly the bar that table sets for a self-warmed row.
 */
export function deriveAirports(items) {
  const byIata = new Map();
  for (const item of items) {
    for (const side of ["origin", "destination"]) {
      const airport = item?.airport?.[side];
      const iata = airport?.code?.iata;
      const tz = airport?.timezone?.name;
      // Skip rather than invent: a row with a fabricated tz silently computes wrong report times
      // everywhere downstream.
      if (!iata || !tz) continue;
      if (!byIata.has(iata)) {
        byIata.set(iata, {
          iata,
          name: airport.name ?? iata,
          city: airport.position?.region?.city ?? airport.name ?? iata,
          tz,
        });
      }
    }
  }
  return [...byIata.values()];
}

/** Local wall-clock parts for a UTC epoch at a fixed offset. */
function localParts(epochSeconds, offsetSeconds) {
  const d = new Date((epochSeconds + offsetSeconds) * 1000);
  return {
    date: d.toISOString().slice(0, 10),
    hhmm: d.toISOString().slice(11, 16),
    weekday: d.getUTCDay() === 0 ? 7 : d.getUTCDay(), // ISO: 1=Mon..7=Sun
  };
}

/**
 * One API item -> one leg, or null when the item is unusable (a cancelled or未-scheduled entry
 * carries null times, and fr24 occasionally returns an item with no destination).
 */
export function toLeg(item) {
  const dep = item?.time?.scheduled?.departure;
  const arr = item?.time?.scheduled?.arrival;
  const origin = item?.airport?.origin;
  const dest = item?.airport?.destination;
  if (!dep || !arr || !origin?.code?.iata || !dest?.code?.iata) return null;

  const depLocal = localParts(dep, origin.timezone?.offset ?? 0);
  const arrLocal = localParts(arr, dest.timezone?.offset ?? 0);
  return {
    origin: origin.code.iata,
    dest: dest.code.iata,
    depEpoch: dep,
    arrEpoch: arr,
    depLocal: depLocal.hhmm,
    arrLocal: arrLocal.hhmm,
    depDate: depLocal.date,
    depWeekday: depLocal.weekday,
    // Whole days between the two LOCAL calendar dates. A leg can land two days later, which the
    // old "arrival time reads earlier than departure" test could never express.
    dayOffset: Math.round(
      (Date.parse(`${arrLocal.date}T00:00:00Z`) - Date.parse(`${depLocal.date}T00:00:00Z`)) / 86_400_000
    ),
  };
}

/**
 * Groups legs into services (one flight number can fly DXB->GIG->EZE as two legs on one day)
 * by walking departures in time order and starting a new service whenever the chain breaks.
 *
 * `MAX_CONNECT` is the ground time that still counts as the same service. EK247's Rio stop is
 * ~2.5h; a full day means the next day's operation.
 */
const MAX_CONNECT = 12 * 3600;

export function groupServices(legs) {
  const sorted = [...legs].sort((a, b) => a.depEpoch - b.depEpoch);
  const services = [];
  let current = [];
  for (const leg of sorted) {
    const prev = current[current.length - 1];
    const continues = prev && prev.dest === leg.origin && leg.depEpoch - prev.arrEpoch <= MAX_CONNECT;
    if (!continues) {
      if (current.length) services.push(current);
      current = [];
    }
    current.push(leg);
  }
  if (current.length) services.push(current);
  return services;
}

/**
 * Aggregates every sampled service into one row per leg_seq.
 *
 * Route and times take the most common value across services, so a single irregular day can't
 * define the schedule. Weekdays are judged only between a leg's first and last sighting: the
 * sample is a short window truncated at both ends, so counting absences across the whole span
 * marks daily flights as non-daily.
 */
export function deriveLegSchedule(items) {
  const legs = items.map(toLeg).filter(Boolean);
  if (!legs.length) return [];

  const services = groupServices(legs);
  const bySeq = new Map();
  for (const service of services) {
    service.forEach((leg, legSeq) => {
      if (!bySeq.has(legSeq)) bySeq.set(legSeq, { combos: new Map(), days: [] });
      const slot = bySeq.get(legSeq);
      const key = JSON.stringify([leg.origin, leg.dest, leg.depLocal, leg.arrLocal, leg.dayOffset]);
      slot.combos.set(key, (slot.combos.get(key) ?? 0) + 1);
      slot.days.push({ date: service[0].depDate, weekday: leg.depWeekday });
    });
  }

  const serviceDates = [...new Set(services.map((s) => s[0].depDate))].sort();

  return [...bySeq.keys()]
    .sort((a, b) => a - b)
    .map((legSeq) => {
      const slot = bySeq.get(legSeq);
      let bestKey = null;
      let bestCount = -1;
      for (const [key, count] of slot.combos) {
        if (count > bestCount) {
          bestKey = key;
          bestCount = count;
        }
      }
      const [origin, dest, depLocal, arrLocal, dayOffset] = JSON.parse(bestKey);
      return {
        legSeq,
        origin,
        dest,
        depLocal,
        arrLocal,
        dayOffset,
        daysOfWeek: daysOfWeekFor(slot.days, serviceDates),
      };
    });
}

function daysOfWeekFor(days, serviceDates) {
  const seen = new Set(days.map((d) => d.date));
  const first = serviceDates.findIndex((d) => seen.has(d));
  const last = serviceDates.findLastIndex((d) => seen.has(d));
  const window = serviceDates.slice(first, last + 1);
  if (window.every((d) => seen.has(d))) return "1234567";
  return [...new Set(days.map((d) => d.weekday))].sort((a, b) => a - b).join("");
}

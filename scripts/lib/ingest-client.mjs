/**
 * How the local scripts write to production: an HTTP call to the Worker, never a database
 * connection.
 *
 * The scripts used to run `wrangler d1 execute --remote` with raw SQL. That gave a script on a
 * laptop unlimited, unvalidated write access to the live database, and it produced this
 * project's worst bugs — schedule rows whose airports were never inserted (14 flights sat in
 * the table and 404'd), a `source` value the schema did not define, and a probe row left in a
 * real user's roster. Everything now goes through /api/ingest, which validates with the same
 * schema the app reads and is covered by tests.
 *
 * Config comes from the environment so a run can be pointed at a local Worker instead:
 *   DANYEOWA_API   default https://danyeowa.com
 *   INGEST_TOKEN   required; matches the Worker secret of the same name
 */
const BASE = process.env.DANYEOWA_API ?? "https://danyeowa.com";

function token() {
  const value = process.env.INGEST_TOKEN;
  if (!value) {
    throw new Error(
      "INGEST_TOKEN is not set. Export it (see docs/RUNBOOK.md) — the scripts have no database " +
        "access of their own by design.",
    );
  }
  return value;
}

/**
 * One call, retried on transient failure.
 *
 * A single blip used to kill a whole run: the arrival refresher died twice on a Cloudflare 7403
 * that resolved on its own moments later. Retrying is not optional politeness here, it is what
 * keeps a 15-minute job from silently skipping a cycle.
 */
async function request(path, init, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token()}`,
          ...(init?.headers ?? {}),
        },
      });
      if (res.status === 401) throw new Error("ingest rejected the token (401)");
      if (!res.ok) throw new Error(`ingest ${path} -> HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return await res.json();
    } catch (e) {
      lastError = e;
      // A rejected token will not fix itself; retrying only delays a clear error.
      if (String(e).includes("401")) throw e;
      if (attempt < attempts) await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
  throw lastError;
}

/** Upserts harvested airports and schedule legs. Airports are written first, server-side. */
export function postSchedules(payload) {
  return request("/api/ingest/schedules", { method: "POST", body: JSON.stringify(payload) });
}

/** Arrivals due soon that have not finished their alert stages. */
export async function getUpcomingArrivals(hours = 4) {
  const body = await request(`/api/ingest/upcoming-arrivals?hours=${hours}`, { method: "GET" });
  return body.flights ?? [];
}

/** Applies corrected arrival times and re-arms their alert stages. */
export function postArrivalCorrections(corrections) {
  return request("/api/ingest/arrival-corrections", {
    method: "POST",
    body: JSON.stringify({ corrections }),
  });
}

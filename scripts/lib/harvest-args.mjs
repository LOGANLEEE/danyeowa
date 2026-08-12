/**
 * Argument handling for the schedule harvester, kept in its own module so it can be unit-tested.
 *
 * fetch-schedules.mjs pulls in Playwright and node:child_process, and the worker test suite runs
 * in workerd where those do not exist — importing the script itself to reach these two functions
 * fails with `No such module "node:process"`.
 */
export function parseArgs(argv) {
  const args = { delay: 8000, limit: Infinity, apply: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--flights") args.flights = argv[++i];
    else if (a === "--range") args.range = argv[++i];
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--delay") args.delay = Number(argv[++i]);
    else if (a === "--apply") args.apply = true;
    else if (a === "--retry-missing") args.retryMissing = true;
    else if (a === "--live-roster") args.liveRoster = true;
    else if (a === "--force") args.force = true;
    else if (a === "--dry-run") void 0; // no-op: dry-run is already the default without --apply
  }
  if (!args.flights && !args.range && !args.liveRoster)
    throw new Error("pass --flights EK247,EK49, --range 0-999, or --live-roster");
  return args;
}

export function expandFlights(args) {
  if (args.liveRoster) return [];
  if (args.flights)
    return args.flights
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const [lo, hi] = args.range.split("-").map(Number);
  const out = [];
  for (let n = lo; n <= hi; n++) out.push(`EK${n}`);
  return out;
}


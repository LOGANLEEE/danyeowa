/**
 * A wall-clock kill switch for the two browser-driven launchd jobs.
 *
 * Why this exists, measured 2026-09-07: `refresh-arrivals` had one invocation alive for 5 days
 * 17 hours and `fetch-schedules` for 4 days 1 hour. Neither was working — 12.97s and 1.43s of
 * CPU across those spans, no open sockets, an empty kqueue. Each still owned a live
 * `launchPersistentContext` Chrome (and 42 of its renderer processes). launchd will not start a
 * new instance of a StartInterval job while the previous one lives, so both jobs were dead for
 * days: the newest harvested schedule row was 5 days old, and arrival alerts had been firing off
 * the uncorrected timetable the whole time.
 *
 * `refresh-arrivals` even caught its own error and set `process.exitCode = 1` — which does
 * nothing while a browser handle holds the event loop open. Setting an exit code is a request;
 * this is not.
 *
 * ponytail: `process.exit()` is a hammer — it drops pending writes on the floor. That is the
 * right trade here because these jobs are idempotent and re-run on a timer, and because the
 * alternative (enumerating every handle a stuck Chrome can leave behind) is the thing that
 * failed. If a job ever needs to flush something on the way out, give it an explicit shutdown
 * step rather than softening this.
 */

/** Exit code 75 is sysexits.h's EX_TEMPFAIL: "try again later", which is exactly true here. */
export const WATCHDOG_EXIT_CODE = 75;

/**
 * Arms a timer that force-exits the process if it is still alive after `ms`.
 *
 * Returns the timer, so the caller cancels with `clearTimeout(...)` and a test can assert the
 * `unref()` below actually happened.
 *
 * The `unref()` is load-bearing, not tidiness: without it the watchdog itself keeps the event
 * loop alive for its full duration, so every healthy run would sit idle until the deadline
 * instead of exiting when its work is done. An unref'd timer still fires — it just stops
 * *being a reason* for node to stay up.
 */
export function armWatchdog(ms, label, { onExpire, log = console.log } = {}) {
  const expire = onExpire ?? (() => process.exit(WATCHDOG_EXIT_CODE));
  const timer = setTimeout(() => {
    log(
      `${new Date().toISOString()} WATCHDOG: ${label} still running after ${Math.round(ms / 1000)}s — forcing exit`,
    );
    expire();
  }, ms);
  timer.unref();
  return timer;
}

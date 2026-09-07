import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { armWatchdog, WATCHDOG_EXIT_CODE } from "./watchdog.mjs";

/**
 * The kill switch that stops a stuck Chrome from taking a launchd job off the air.
 *
 * Measured 2026-09-07: two jobs sat alive for 5d17h and 4d1h with ~0 CPU, each holding a
 * `launchPersistentContext` browser that never closed. launchd will not start a new instance of
 * a StartInterval job while the old one lives, so "one run hangs" silently means "the job is
 * dead until someone looks".
 */
describe("armWatchdog", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not fire before its deadline", () => {
    const onExpire = vi.fn();
    armWatchdog(600_000, "job", { onExpire, log: () => {} });

    vi.advanceTimersByTime(599_999);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("fires once the deadline passes", () => {
    const onExpire = vi.fn();
    armWatchdog(600_000, "job", { onExpire, log: () => {} });

    vi.advanceTimersByTime(600_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("says which job it killed and how long it waited", () => {
    const log = vi.fn();
    armWatchdog(600_000, "refresh-arrivals", { onExpire: () => {}, log });

    vi.advanceTimersByTime(600_000);
    // A cron log is read after the fact, by someone who does not know what was running.
    expect(log.mock.calls[0][0]).toContain("refresh-arrivals");
    expect(log.mock.calls[0][0]).toContain("600s");
  });

  it("can be cancelled by a run that finishes in time", () => {
    const onExpire = vi.fn();
    const timer = armWatchdog(600_000, "job", { onExpire, log: () => {} });

    clearTimeout(timer);
    vi.advanceTimersByTime(600_000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("does not itself keep the process alive", () => {
    const timer = armWatchdog(600_000, "job", { onExpire: () => {}, log: () => {} });
    // Without unref(), every healthy run would idle until the deadline instead of exiting when
    // its work is done — the watchdog would become the hang it exists to prevent.
    expect(timer.hasRef()).toBe(false);
  });

  it("exits 75 (EX_TEMPFAIL) by default, because the next run is the retry", () => {
    expect(WATCHDOG_EXIT_CODE).toBe(75);
  });
});

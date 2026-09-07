import { defineConfig } from "vitest/config";

/**
 * These are Node scripts, so they need Node's runtime — not workerd and not jsdom.
 *
 * `scripts/lib` helpers were previously tested only from `worker/test/schedule-providers/`,
 * which runs under `@cloudflare/vitest-pool-workers`. That is fine for pure functions, and
 * silently wrong for anything touching Node built-ins: workerd's `setTimeout` returns a number,
 * so `timer.unref()` — the load-bearing line in `lib/watchdog.mjs` — is not even a function
 * there. Found 2026-09-07 when the watchdog test failed with "timer.unref is not a function".
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.mjs"],
    exclude: ["**/node_modules/**"],
  },
});

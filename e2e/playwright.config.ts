import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Runs against a real `wrangler dev` serving the built web app + worker on :8787 — the
 * same local D1 the app uses for `pnpm dev`. Requires E2E_TEST_MODE=true (and
 * DEV_OTP_FALLBACK=true) in .dev.vars so GET /api/__e2e/last-otp is reachable; see
 * .dev.vars.example. Chromium only per plan; retries: 1 to absorb rare dev-server
 * cold-start flake without masking real failures.
 *
 * The `setup` project (auth.setup.ts) signs in ONCE and saves storageState to
 * e2e/.auth/user.json (an absolute path — Playwright/Node resolve a relative
 * `storageState` against the process cwd, not this config file's directory, which
 * differs depending on whether the suite is invoked as `pnpm test:e2e` from the repo
 * root or `playwright test` from inside e2e/); the `chromium` project depends on it and
 * loads that file for every spec's default `page` context, so the suite sends exactly
 * one OTP total regardless of how many spec files exist — well under better-auth's
 * IP-keyed 3-per-60s rate limit (worker/src/auth.ts). A spec that needs a genuinely
 * unauthenticated context (share.spec.ts's cookie-less family viewer) uses
 * `browser.newContext()` directly, which never inherits this project-level storageState.
 */
export const AUTH_FILE = path.join(__dirname, ".auth", "user.json");

export default defineConfig({
  testDir: ".",
  // Timeouts sized for the CI runner, not for a laptop. The suite takes ~1 minute locally and
  // 2-4 minutes on GitHub's runner, and every flake that has blocked a deploy has been the same
  // shape: an assertion that the UI has caught up, timing out at 5s while the write was still
  // in flight. The retry then passes, which is the tell — these are latency failures, not wrong
  // answers, and no assertion is weakened by giving it room.
  //
  // Where the distinction actually matters, prefer helpers.ts's expectRosterCount: it asks the
  // server whether the write landed, so "never written" and "not yet painted" stop looking
  // identical. A longer timeout hides that difference; it just stops it costing a deploy.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8787",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: AUTH_FILE },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    // Migrations + airport/schedule seeds run every time (all idempotent — migrations
    // apply is a no-op once applied, and the seed SQL is INSERT ... ON CONFLICT DO
    // UPDATE) so a fresh checkout's local D1 (no .wrangler/state yet) works identically
    // to a developer's already-seeded one, which the fixture (DXB/LHR, EK001) depends on.
    // seed-e2e-fixtures.sql layers in e2e-only cache rows (e.g. EK097/EK098, required by
    // autofill.spec.ts's TURNAROUND scenario) that aren't part of the app's real
    // live-source-verified seed set — this keeps the flight numbers every spec exercises
    // as pre-warmed cache-hits so the suite never depends on live provider network calls.
    command:
      "cd .. && pnpm --filter @danyeowa/web build" +
      " && wrangler d1 migrations apply danyeowa-db --local" +
      " && wrangler d1 execute danyeowa-db --local --file ./scripts/seed-airports.sql" +
      " && wrangler d1 execute danyeowa-db --local --file ./scripts/seed-schedules.sql" +
      " && wrangler d1 execute danyeowa-db --local --file ./scripts/seed-e2e-fixtures.sql" +
      " && wrangler dev --port 8787",
    url: "http://localhost:8787/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

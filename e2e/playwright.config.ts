import { defineConfig, devices } from "@playwright/test";

/**
 * Runs against a real `wrangler dev` serving the built web app + worker on :8787 — the
 * same local D1 the app uses for `pnpm dev`. Requires E2E_TEST_MODE=true (and
 * DEV_OTP_FALLBACK=true) in .dev.vars so GET /api/__e2e/last-otp is reachable; see
 * .dev.vars.example. Chromium only per plan; retries: 1 to absorb rare dev-server
 * cold-start flake without masking real failures.
 */
export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  expect: { timeout: 5_000 },
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
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Migrations + airport seed run every time (both are idempotent — migrations apply
    // is a no-op once applied, and the seed SQL is INSERT ... ON CONFLICT DO UPDATE) so
    // a fresh checkout's local D1 (no .wrangler/state yet) works identically to a
    // developer's already-seeded one, which the fixture (DXB/LHR) depends on.
    command:
      "cd .. && pnpm --filter @roaster/web build" +
      " && wrangler d1 migrations apply roaster-me-db --local" +
      " && wrangler d1 execute roaster-me-db --local --file ./scripts/seed-airports.sql" +
      " && wrangler dev --port 8787",
    url: "http://localhost:8787/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

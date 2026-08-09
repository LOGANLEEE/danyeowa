import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, "../drizzle"));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "../wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            BETTER_AUTH_SECRET: "test-secret-not-for-production-0000000",
            DEV_OTP_FALLBACK: "true",
            GOOGLE_CLIENT_ID: "test-google-client-id",
            GOOGLE_CLIENT_SECRET: "test-google-client-secret",
            VAPID_PUBLIC_KEY: "test-vapid-public-key",
            AERODATABOX_KEY: "test-aerodatabox-key",
            // Forwarded from the invoking shell so the live-network integration test can
            // opt in via `LIVE_PROVIDER_TEST=1 pnpm test` — plain `process.env` inside a
            // test file is NOT the invoking shell's env (tests run inside the workerd
            // sandbox via Miniflare), so this must be threaded through as a binding from
            // this Node-side config factory, which does see the real `process.env`.
            LIVE_PROVIDER_TEST: process.env.LIVE_PROVIDER_TEST ?? "",
          },
        },
      }),
    ],
    test: { setupFiles: ["./test/apply-migrations.ts"] },
  };
});

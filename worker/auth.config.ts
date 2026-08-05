import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";

// CLI-visible static config used only by `@better-auth/cli generate` to introspect
// the schema. The runtime app uses `createAuth` in `src/auth.ts` (per-request
// factory, required on Workers — see src/auth.ts). This file is never imported
// by the Worker; it exists solely so the CLI has a resolvable `auth` export.
// The in-memory better-sqlite3 db below is a schema-generation stand-in only —
// production uses the D1 binding via drizzle-orm/d1 (see src/auth.ts).
export const auth = betterAuth({
  database: drizzleAdapter(drizzle(new Database(":memory:")), {
    provider: "sqlite",
  }),
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 3,
      rateLimit: { window: 60, max: 3 },
      async sendVerificationOTP() {
        /* Task 2 */
      },
    }),
  ],
});

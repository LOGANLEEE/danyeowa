import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import { sendOtpEmail } from "./email";
import * as schema from "./db/schema";

export type AuthEnv = {
  DB: D1Database;
  RESEND_API_KEY?: string;
  DEV_OTP_FALLBACK?: string;
  /**
   * Local-only convenience: this one address always receives DEV_FIXED_OTP instead of a random
   * code, so signing in during development doesn't mean digging the code out of a server log.
   * Inert unless DEV_OTP_FALLBACK is also "true" — see the generateOTP guard below.
   */
  DEV_FIXED_OTP_EMAIL?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
};

/** The code handed to DEV_FIXED_OTP_EMAIL. Six digits, to satisfy otpLength. */
const DEV_FIXED_OTP = "123123";

/**
 * The fixed local sign-in code, or undefined to let better-auth generate a random one.
 *
 * DEV_OTP_FALLBACK is the real gate: it lives in .dev.vars and the e2e workflow and is NEVER
 * present in wrangler.jsonc's vars, so a deployed Worker cannot reach the fixed branch even if
 * DEV_FIXED_OTP_EMAIL were somehow set on it. Exported so that guarantee is covered by tests
 * rather than asserted in a comment.
 */
export function devFixedOtpFor(
  env: Pick<AuthEnv, "DEV_OTP_FALLBACK" | "DEV_FIXED_OTP_EMAIL">,
  email: string,
): string | undefined {
  if (env.DEV_OTP_FALLBACK !== "true" || !env.DEV_FIXED_OTP_EMAIL) return undefined;
  // better-auth lowercases the submitted address before calling generateOTP; fold both sides
  // so a differently-cased .dev.vars entry still matches.
  return email.toLowerCase() === env.DEV_FIXED_OTP_EMAIL.toLowerCase() ? DEV_FIXED_OTP : undefined;
}

export const createAuth = (env: AuthEnv) => {
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET is required");
  }
  if (!env.GOOGLE_CLIENT_ID) {
    throw new Error("GOOGLE_CLIENT_ID is required");
  }
  if (!env.GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_SECRET is required");
  }
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    // rate limiting: enabled explicitly since better-auth's default gates this on
    // NODE_ENV === "production", which is never set on Workers.
    // Storage is in-memory per-isolate for now; follow-up: move to D1/KV for
    // consistency across isolates.
    rateLimit: { enabled: true },
    advanced: {
      // Cloudflare Workers sets cf-connecting-ip at the edge, not x-forwarded-for
      // (better-auth's default header) — without this, per-IP rate limiting can't
      // key correctly on Workers.
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    database: drizzleAdapter(drizzle(env.DB, { schema }), { provider: "sqlite", schema }),
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        rateLimit: { window: 60, max: 3 },
        // Returning undefined falls through to better-auth's own generator
        // (`opts.generateOTP(...) || defaultOTPGenerator(opts)`), so real sign-ins are
        // untouched. See devFixedOtpFor for why this cannot fire in production.
        generateOTP: ({ email }) => devFixedOtpFor(env, email),
        async sendVerificationOTP({ email, otp }) {
          await sendOtpEmail(env, email, otp);
        },
      }),
    ],
  });
};

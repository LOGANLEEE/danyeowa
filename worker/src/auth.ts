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
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
};

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
        async sendVerificationOTP({ email, otp }) {
          await sendOtpEmail(env, email, otp);
        },
      }),
    ],
  });
};

import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import { sendOtpEmail } from "./email";
import * as schema from "./db/schema";

export type AuthEnv = { DB: D1Database; RESEND_API_KEY?: string };

export const createAuth = (env: AuthEnv) =>
  betterAuth({
    database: drizzleAdapter(drizzle(env.DB, { schema }), { provider: "sqlite", schema }),
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

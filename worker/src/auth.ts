import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";

export const createAuth = (env: { DB: D1Database }) =>
  betterAuth({
    database: drizzleAdapter(drizzle(env.DB), { provider: "sqlite" }),
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

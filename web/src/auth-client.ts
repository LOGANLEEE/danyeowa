import { createAuthClient } from "better-auth/client";
import { emailOTPClient } from "better-auth/client/plugins";

// Same-origin SPA: no baseURL override needed in prod, and `pnpm dev` proxies
// /api -> the worker (see vite.config.ts), so the default (current origin) works too.
export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
});

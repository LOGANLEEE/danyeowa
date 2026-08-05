import { Hono } from "hono";
import type { HealthResponse, Me } from "@roaster/shared";
import { createAuth } from "./auth";
import { getLastDevOtp } from "./email";
import { tripsRouter } from "./trips";

export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  RESEND_API_KEY?: string;
  DEV_OTP_FALLBACK?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  /**
   * Test-only escape hatch: enables GET /api/__e2e/last-otp so the Playwright suite can
   * retrieve a dev-fallback OTP without a real inbox. Must NEVER be set in wrangler.jsonc
   * `vars` — it lives only in .dev.vars (gitignored), the e2e runner env, and vitest
   * bindings. The route 404s whenever this isn't exactly the string "true".
   */
  E2E_TEST_MODE?: string;
};

type Session = Awaited<ReturnType<ReturnType<typeof createAuth>["api"]["getSession"]>>;

type Variables = {
  auth: ReturnType<typeof createAuth>;
  user: NonNullable<Session>["user"] | null;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("/api/*", async (c, next) => {
  const auth = createAuth(c.env);
  c.set("auth", auth);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", session?.user ?? null);
  await next();
});

app.get("/api/health", async (c) => {
  const row = await c.env.DB.prepare("SELECT 1 AS one").first<{ one: number }>();
  const body: HealthResponse = { ok: true, d1: row?.one === 1 };
  return c.json(body);
});

app.on(["POST", "GET"], "/api/auth/*", (c) => c.var.auth.handler(c.req.raw));

app.get("/api/me", (c) => {
  const user = c.var.user;
  if (!user) {
    return c.json({ error: "unauthenticated" }, 401);
  }
  const body: Me = { id: user.id, email: user.email, name: user.name ?? null };
  return c.json(body);
});

// Test-only route: exposes the most recently captured dev-fallback OTP so the
// Playwright e2e suite can sign in without a real inbox. Gated on E2E_TEST_MODE so it
// can never be reachable in a deployed environment (that var is never set in
// wrangler.jsonc `vars` — see Env.E2E_TEST_MODE doc comment).
app.get("/api/__e2e/last-otp", (c) => {
  if (c.env.E2E_TEST_MODE !== "true") {
    return c.notFound();
  }
  const email = c.req.query("email");
  if (!email) {
    return c.json({ error: "email is required" }, 400);
  }
  const otp = getLastDevOtp();
  if (!otp) {
    return c.json({ error: "no OTP captured yet" }, 404);
  }
  return c.json({ otp });
});

app.route("/api", tripsRouter);

export default app;

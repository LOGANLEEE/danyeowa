import { Hono } from "hono";
import type { HealthResponse, Me } from "@roaster/shared";
import { createAuth } from "./auth";

export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  RESEND_API_KEY?: string;
};

type Session = Awaited<ReturnType<ReturnType<typeof createAuth>["api"]["getSession"]>>;

type Variables = {
  auth: ReturnType<typeof createAuth>;
  user: NonNullable<Session>["user"] | null;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.get("/api/health", async (c) => {
  const row = await c.env.DB.prepare("SELECT 1 AS one").first<{ one: number }>();
  const body: HealthResponse = { ok: true, d1: row?.one === 1 };
  return c.json(body);
});

app.use("/api/*", async (c, next) => {
  const auth = createAuth(c.env);
  c.set("auth", auth);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", session?.user ?? null);
  await next();
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

export default app;

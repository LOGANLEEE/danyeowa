import { Hono } from "hono";
import type { HealthResponse } from "@roaster/shared";

export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", async (c) => {
  const row = await c.env.DB.prepare("SELECT 1 AS one").first<{ one: number }>();
  const body: HealthResponse = { ok: true, d1: row?.one === 1 };
  return c.json(body);
});

export default app;

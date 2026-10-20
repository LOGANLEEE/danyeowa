import { afterEach, expect, it, vi } from "vitest";
import { createTrip } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

// /usage reports a failed save by status; the message alone cannot tell a 400 from a 500.
it("a refused save carries the server's status alongside its message", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "unknown airport: QQQ" }), { status: 400 })),
  );
  const err = await createTrip({ legs: [] }).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(Error);
  expect((err as Error).message).toBe("unknown airport: QQQ");
  expect((err as { status?: number }).status).toBe(400);
});

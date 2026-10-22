import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TrackModule = typeof import("./track");

let mod: TrackModule;
const fetchMock = vi.fn();

function posted(call: number) {
  const [url, init] = fetchMock.mock.calls[call]! as [string, RequestInit];
  return { url, init, body: JSON.parse(init.body as string) };
}

function setVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  // Bubbles, as the browser's own does (HTML spec: "with its bubbles attribute initialized to true").
  document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
}

beforeEach(async () => {
  vi.useFakeTimers();
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  // A fresh module per test: the queue and session id are module state, by design.
  vi.resetModules();
  mod = await import("./track");
});

afterEach(() => {
  setVisibility("visible");
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("track", () => {
  it("sends nothing while signed out", async () => {
    mod.track("add_form_opened", {});
    await vi.advanceTimersByTimeAsync(5000);
    setVisibility("hidden");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("batches events and posts them once, about 2s later, with keepalive", async () => {
    mod.setTrackingEnabled(true);
    mod.track("app_opened", { standalone: false });
    mod.track("tab_viewed", { tab: "settings" });
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, body } = posted(0);
    expect(url).toBe("/api/events");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(body.events.map((e: { name: string }) => e.name)).toEqual(["app_opened", "tab_viewed"]);
    expect(body.events[1].props).toEqual({ tab: "settings" });
    expect(typeof body.events[0].at).toBe("number");
    expect(typeof body.sessionId).toBe("string");
  });

  it("keeps one session id for the whole page load", async () => {
    mod.setTrackingEnabled(true);
    mod.track("add_form_opened", {});
    await vi.advanceTimersByTimeAsync(2000);
    mod.track("trip_deleted", {});
    await vi.advanceTimersByTimeAsync(2000);
    expect(posted(0).body.sessionId).toBe(posted(1).body.sessionId);
  });

  it("flushes straight away when the page is hidden", async () => {
    mod.setTrackingEnabled(true);
    mod.track("trip_deleted", {});
    setVisibility("hidden");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lets an event recorded by the page's own hidden handler into the flush on hidden", async () => {
    mod.setTrackingEnabled(true);
    // The add form registers its listener long after this module loaded, and records form_left
    // from it. Hidden may be the last moment the page runs, so that event must leave now.
    const formLeft = () =>
      mod.track("form_left", { lastStep: "opened", msSinceOpen: 1, reason: "hidden" });
    document.addEventListener("visibilitychange", formLeft);
    try {
      setVisibility("hidden");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(posted(0).body.events.map((e: { name: string }) => e.name)).toEqual(["form_left"]);
    } finally {
      document.removeEventListener("visibilitychange", formLeft);
    }
  });

  it("keeps events in the order they were recorded, even within one millisecond", async () => {
    mod.setTrackingEnabled(true);
    vi.setSystemTime(1_800_000_000_000);
    mod.track("add_form_opened", {});
    mod.track("form_step", { step: "time_edited", msSinceOpen: 0 });
    await vi.advanceTimersByTimeAsync(2000);
    const [a, b] = posted(0).body.events as { at: number }[];
    expect(b!.at).toBeGreaterThan(a!.at);
  });

  it("splits more than 20 queued events into batches the server accepts", async () => {
    mod.setTrackingEnabled(true);
    for (let i = 0; i < 25; i++) mod.track("tab_viewed", { tab: "calendar" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(posted(0).body.events).toHaveLength(20);
    expect(posted(1).body.events).toHaveLength(5);
  });

  it("never throws, whether fetch rejects or throws outright", async () => {
    mod.setTrackingEnabled(true);
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    mod.track("add_form_opened", {});
    await expect(vi.advanceTimersByTimeAsync(2000)).resolves.not.toThrow();

    fetchMock.mockImplementationOnce(() => {
      throw new TypeError("boom");
    });
    mod.track("add_form_opened", {});
    expect(() => setVisibility("hidden")).not.toThrow();
  });
});

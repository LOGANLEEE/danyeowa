import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SharedView } from "@roaster/shared";
import App from "./App";
import { getSharedView } from "./api";

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  getSharedView: vi.fn(),
}));

vi.mock("./auth-client", () => ({
  authClient: {
    signOut: vi.fn(),
    emailOtp: { sendVerificationOtp: vi.fn() },
    signIn: { emailOtp: vi.fn() },
  },
}));

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function stubSignedOutFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/health")) return Promise.resolve(jsonResponse({ ok: true, d1: true }));
      if (url.includes("/api/me")) return Promise.resolve(jsonResponse({ error: "unauthenticated" }, { status: 401 }));
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    })
  );
}

function stubSignedInFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/health")) return Promise.resolve(jsonResponse({ ok: true, d1: true }));
      if (url.includes("/api/me")) return Promise.resolve(jsonResponse({ email: "pilot@example.com" }));
      if (url.includes("/api/trips")) return Promise.resolve(jsonResponse({ trips: [] }));
      if (url.includes("/api/share-links")) return Promise.resolve(jsonResponse({ links: [] }));
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    })
  );
}

describe("App", () => {
  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("renders the shared viewer for /share/:token with zero auth or app fetches", async () => {
    const fetchSpy = vi.fn((_input: RequestInfo | URL) =>
      Promise.reject(new Error("fetch should not be called on /share/ route")),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const view: SharedView = { crewName: "Isis", generatedAt: "2026-08-15T00:00:00.000Z", trips: [] };
    vi.mocked(getSharedView).mockResolvedValue(view);

    window.history.pushState({}, "", "/share/tok123");
    render(<App />);

    expect(await screen.findByTestId("shared-hero")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-calendar")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    const calledUrls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(calledUrls.some((u) => u.includes("/api/me"))).toBe(false);
    expect(calledUrls.some((u) => u.includes("/api/auth"))).toBe(false);
  });

  it("renders the inactive card (not a crash) for a hand-mangled /share/ path with a lone %", async () => {
    const fetchSpy = vi.fn((_input: RequestInfo | URL) =>
      Promise.reject(new Error("fetch should not be called on /share/ route")),
    );
    vi.stubGlobal("fetch", fetchSpy);
    // A raw, unencoded "%" isn't a valid percent-escape - decodeURIComponent would throw a
    // URIError on it. getSharedView resolves null (as the real 404 does for any unrecognized
    // token) so the malformed value flows through to the same friendly inactive state as any
    // other bad link, rather than needing special-casing.
    vi.mocked(getSharedView).mockResolvedValue(null);

    window.history.pushState({}, "", "/share/100%");
    expect(() => render(<App />)).not.toThrow();

    expect(await screen.findByTestId("shared-inactive")).toBeInTheDocument();
    expect(getSharedView).toHaveBeenCalledWith("100%");
  });

  it("shows title, API status, and the inline sign-in form (one surface, no login screen) when signed out", async () => {
    stubSignedOutFetch();
    render(<App />);
    // Exactly one h1 on the page — the Landing hero — no duplicate with the header chrome.
    expect(screen.getAllByRole("heading", { name: /roaster/i, level: 1 })).toHaveLength(1);
    expect(await screen.findByText(/api: online/i)).toBeInTheDocument();
    // Email is visible up front, no separate CTA/navigation needed to reach it.
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send code/i })).toBeInTheDocument();
  });

  it("hides the tab bar when signed out", async () => {
    stubSignedOutFetch();
    render(<App />);
    await screen.findByText(/api: online/i);
    expect(screen.queryByTestId("tab-calendar")).not.toBeInTheDocument();
  });

  it("shows the tab bar and defaults to the calendar tab when signed in", async () => {
    stubSignedInFetch();
    render(<App />);
    expect(await screen.findByTestId("tab-calendar")).toBeInTheDocument();
    expect(screen.getByTestId("tab-calendar").className).toContain("text-accent");
    expect(await screen.findByText(/no trips yet/i)).toBeInTheDocument();
  });

  it("switches views when a tab is clicked", async () => {
    stubSignedInFetch();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTestId("tab-calendar");

    await user.click(screen.getByTestId("tab-share"));
    expect(await screen.findByText(/family opens the link/i)).toBeInTheDocument();

    await user.click(screen.getByTestId("tab-settings"));
    expect(await screen.findByText("pilot@example.com")).toBeInTheDocument();
  });

  it("no longer shows email/sign-out in the header - they live in Settings", async () => {
    stubSignedInFetch();
    render(<App />);
    await screen.findByTestId("tab-calendar");
    expect(screen.queryByText("pilot@example.com")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
  });

  it("signs out from the Settings tab", async () => {
    stubSignedInFetch();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByTestId("tab-settings"));

    await user.click(await screen.findByRole("button", { name: /sign out/i }));
    expect(await screen.findByRole("heading", { name: /roaster/i, level: 1 })).toBeInTheDocument();
  });
});

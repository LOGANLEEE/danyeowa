import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UsageResponse } from "@danyeowa/shared";
import App from "./App";
import { setTrackingEnabled, track } from "./lib/track";

vi.mock("./lib/track", () => ({ track: vi.fn(), setTrackingEnabled: vi.fn() }));
vi.mock("./auth-client", () => ({
  authClient: { signOut: vi.fn(), emailOtp: { sendVerificationOtp: vi.fn() }, signIn: { emailOtp: vi.fn() } },
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const USAGE: UsageResponse = {
  days: 30,
  users: [
    {
      email: "crew@example.com",
      sessions: 4,
      appOpened: { standalone: 3, browser: 1 },
      funnel: {
        addFormOpened: 5,
        flightLookup: { found: 3, unknown: 1, error: 0 },
        manualEntryOpened: 1,
        tripSaved: { autofill: 3, manual: 1 },
        tripSaveFailed: 1,
      },
      medianMsToSave: 12_500,
      tabViewed: { settings: 2 },
      missingFlights: [{ flightNo: "EK999", unknown: 2, error: 1 }],
      timeEdits: { legsEdited: 1, legsAutofilled: 4 },
      entries: { day: 3, plus: 2 },
      formLeft: { closed: { lookup_unknown: 1 }, hidden: { time_edited: 2 } },
      sittings: [{ startedAt: 1_790_000_000_000, saved: 3, medianGapMs: 45_000 }],
      forms: [
        {
          openedAt: 1_790_000_000_000,
          entry: "day",
          outcome: "saved",
          steps: [
            { label: "opened", gapMs: 0, longest: false },
            { label: "time_edited", gapMs: 8000, longest: true },
            { label: "left_hidden", gapMs: 1000, longest: false },
            { label: "resumed", gapMs: 125_000, longest: false },
            { label: "saved", gapMs: 500, longest: false },
          ],
        },
      ],
      recent: [{ name: "trip_saved", props: { path: "autofill", legs: 1, msSinceOpen: 9000 }, at: 1_790_000_000_000 }],
    },
  ],
};

function stubFetch(canViewUsage: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/health")) return Promise.resolve(json({ ok: true, d1: true }));
      if (url.includes("/api/me"))
        return Promise.resolve(json({ id: "u1", email: "logan@example.com", name: null, canViewUsage }));
      if (url.includes("/api/usage")) return Promise.resolve(json(USAGE));
      if (url.includes("/api/trips")) return Promise.resolve(json({ trips: [] }));
      if (url.includes("/api/crew")) return Promise.resolve(json({ members: [], received: [], sent: [] }));
      if (url.includes("/api/push")) return Promise.resolve(json({}, 404));
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }),
  );
}

describe("usage tracking in the app shell", () => {
  beforeEach(() => {
    vi.mocked(track).mockReset();
    vi.mocked(setTrackingEnabled).mockReset();
  });
  afterEach(() => {
    window.history.pushState({}, "", "/");
    vi.unstubAllGlobals();
  });

  it("turns tracking on once signed in and records the app opening in a browser tab", async () => {
    stubFetch(false);
    render(<App />);
    await screen.findByTestId("tab-calendar");
    expect(setTrackingEnabled).toHaveBeenCalledWith(true);
    expect(track).toHaveBeenCalledWith("app_opened", { standalone: false });
  });

  it("records each tab she moves to", async () => {
    stubFetch(false);
    render(<App />);
    await userEvent.click(await screen.findByTestId("tab-settings"));
    expect(track).toHaveBeenCalledWith("tab_viewed", { tab: "settings" });
  });

  it("links Settings to /usage only for a viewer", async () => {
    stubFetch(false);
    const { unmount } = render(<App />);
    await userEvent.click(await screen.findByTestId("tab-settings"));
    await screen.findByTestId("settings-view");
    expect(screen.queryByRole("link", { name: /usage/i })).not.toBeInTheDocument();
    unmount();

    stubFetch(true);
    render(<App />);
    await userEvent.click(await screen.findByTestId("tab-settings"));
    expect(await screen.findByRole("link", { name: /usage/i })).toHaveAttribute("href", "/usage");
  });

  it("renders the funnel at /usage", async () => {
    window.history.pushState({}, "", "/usage");
    stubFetch(true);
    render(<App />);
    const user = await screen.findByTestId("usage-user");
    expect(within(user).getByText("crew@example.com")).toBeInTheDocument();
    expect(within(user).getByTestId("usage-add_form_opened")).toHaveTextContent("5");
    expect(within(user).getByTestId("usage-trip_saved")).toHaveTextContent("4");
    expect(within(user).getByTestId("usage-median")).toHaveTextContent("12.5s");
  });

  it("renders where the add flow is slow: misses, entries, abandons, sittings, timelines", async () => {
    window.history.pushState({}, "", "/usage");
    stubFetch(true);
    render(<App />);
    const user = await screen.findByTestId("usage-user");
    expect(within(user).getByTestId("usage-missing-EK999")).toHaveTextContent("2 unknown / 1 error");
    expect(within(user).getByTestId("usage-time-edits")).toHaveTextContent("1 / 4");
    expect(within(user).getByTestId("usage-entry-plus")).toHaveTextContent("2");
    expect(within(user).getByTestId("usage-left-time_edited")).toHaveTextContent("0 / 2");
    expect(within(user).getByTestId("usage-sitting")).toHaveTextContent("3 saved · 45.0s");

    const timeline = within(user).getByTestId("usage-form");
    expect(within(timeline).getAllByTestId("usage-form-step")).toHaveLength(5);
    expect(within(timeline).getByTestId("usage-form-longest")).toHaveTextContent("+8.0s");
    // Time away reads as time away, in minutes once it is that long.
    expect(within(timeline).getByText(/back after/i)).toBeInTheDocument();
    expect(timeline).toHaveTextContent("2m 5s");
  });
});

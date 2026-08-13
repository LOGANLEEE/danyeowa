import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SharedView } from "@danyeowa/shared";
import SharedViewer from "./SharedViewer";
import { getSharedView } from "./api";

vi.mock("./api", () => ({
  getSharedView: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const aklTrip = {
  fromIso: "2026-09-01",
  toIso: "2026-09-06",
  awayCity: "Auckland",
  legs: [
    { dateIso: "2026-09-01", fromCity: "Dubai", toCity: "Singapore" },
    { dateIso: "2026-09-01", fromCity: "Singapore", toCity: "Auckland" },
  ],
};

const awayView: SharedView = {
  crewName: "Isis",
  generatedAt: "2026-09-03T00:00:00.000Z",
  trips: [aklTrip],
};

const homeUpcomingView: SharedView = {
  crewName: "Isis",
  generatedAt: "2026-08-15T00:00:00.000Z",
  trips: [aklTrip],
};

const noTripsView: SharedView = {
  crewName: "Isis",
  generatedAt: "2026-08-15T00:00:00.000Z",
  trips: [],
};

describe("SharedViewer", () => {
  it("fires no auth-related fetches at all - only the public shared endpoint", async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("fetch should not be called directly")));
    vi.stubGlobal("fetch", fetchSpy);
    vi.mocked(getSharedView).mockResolvedValue(awayView);

    render(<SharedViewer token="tok123" now={new Date("2026-09-03T12:00:00.000Z")} />);
    await screen.findByTestId("shared-hero");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getSharedView).toHaveBeenCalledWith("tok123");
  });

  it("shows a loading skeleton before the fetch resolves", async () => {
    let resolve!: (v: SharedView) => void;
    vi.mocked(getSharedView).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    render(<SharedViewer token="tok123" now={new Date("2026-09-03T12:00:00.000Z")} />);
    expect(screen.getByTestId("shared-loading")).toBeInTheDocument();

    resolve(noTripsView);
    await waitFor(() => expect(screen.queryByTestId("shared-loading")).not.toBeInTheDocument());
  });

  it("renders the away-now hero with days-until-home and the crew name in the header", async () => {
    vi.mocked(getSharedView).mockResolvedValue(awayView);

    render(<SharedViewer token="tok123" now={new Date("2026-09-03T12:00:00.000Z")} />);

    expect(await screen.findByText(/isis's schedule/i)).toBeInTheDocument();
    const hero = screen.getByTestId("shared-hero");
    expect(hero).toHaveTextContent(/in auckland/i);
    expect(hero).toHaveTextContent(/home sunday/i);
    expect(hero).toHaveTextContent("3");
    expect(hero).toHaveTextContent(/home in/i);
  });

  it("shows 'Home today' instead of 'Home in 0 days' when toIso is today", async () => {
    vi.mocked(getSharedView).mockResolvedValue(awayView);

    // aklTrip.toIso is 2026-09-06 - "now" on that same calendar day (viewer tz UTC here).
    render(<SharedViewer token="tok123" now={new Date("2026-09-06T12:00:00.000Z")} />);

    const hero = await screen.findByTestId("shared-hero");
    expect(hero).toHaveTextContent(/home today/i);
    expect(hero).not.toHaveTextContent(/home in/i);
    expect(hero).not.toHaveTextContent("0");
  });

  it("renders the home-now hero with the next trip date when not currently away", async () => {
    vi.mocked(getSharedView).mockResolvedValue(homeUpcomingView);

    render(<SharedViewer token="tok123" now={new Date("2026-08-15T00:00:00.000Z")} />);

    const hero = await screen.findByTestId("shared-hero");
    expect(hero).toHaveTextContent(/home/i);
    expect(hero).toHaveTextContent(/next trip/i);
    expect(hero).toHaveTextContent(/1 sep/i);
  });

  it("shows 'no trips planned' when there are none at all", async () => {
    vi.mocked(getSharedView).mockResolvedValue(noTripsView);

    render(<SharedViewer token="tok123" now={new Date("2026-08-15T00:00:00.000Z")} />);

    const hero = await screen.findByTestId("shared-hero");
    expect(hero).toHaveTextContent(/no trips planned/i);
  });

  it("renders trip rows in the rolling list with the muted leg line", async () => {
    vi.mocked(getSharedView).mockResolvedValue(awayView);

    render(<SharedViewer token="tok123" now={new Date("2026-09-03T12:00:00.000Z")} />);

    const row = await screen.findByTestId("shared-trip-row");
    expect(row).toHaveTextContent(/auckland trip/i);
    expect(row).toHaveTextContent(/away 6 days/i);
    expect(row).toHaveTextContent(/dubai.*singapore.*auckland/i);
  });

  it("shows the friendly inactive-link message when the token is unknown or revoked", async () => {
    vi.mocked(getSharedView).mockResolvedValue(null);

    render(<SharedViewer token="dead-token" now={new Date("2026-08-15T00:00:00.000Z")} />);

    const inactive = await screen.findByTestId("shared-inactive");
    expect(inactive).toHaveTextContent(/no longer active/i);
    expect(screen.queryByTestId("shared-hero")).not.toBeInTheDocument();
  });

  it("shows the muted footer attribution", async () => {
    vi.mocked(getSharedView).mockResolvedValue(awayView);

    render(<SharedViewer token="tok123" now={new Date("2026-09-03T12:00:00.000Z")} />);

    expect(await screen.findByText(/shared via danyeowa/i)).toBeInTheDocument();
  });
});

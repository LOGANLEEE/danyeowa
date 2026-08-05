import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CrewHome from "./CrewHome";
import { getTrips } from "./api";
import type { TripWithFlights } from "./api";

vi.mock("./api", () => ({
  getTrips: vi.fn(),
}));

// AKL 2-leg trip fixture: DXB -> SIN -> AKL, "now" fixed well before the first report time.
const now = new Date("2026-08-10T00:00:00.000Z");

const aklTrip: TripWithFlights = {
  id: "trip-1",
  userId: "u1",
  label: null,
  createdAt: now.getTime(),
  flights: [
    {
      id: "f1",
      tripId: "trip-1",
      userId: "u1",
      flightNo: "EK448",
      origin: "DXB",
      dest: "SIN",
      depUtc: "2026-08-11T02:15:00.000Z",
      arrUtc: "2026-08-11T13:35:00.000Z",
      reportUtc: "2026-08-11T00:45:00.000Z",
      depTz: "Asia/Dubai",
      arrTz: "Asia/Singapore",
      source: "manual",
      notes: null,
      legSeq: 0,
    },
    {
      id: "f2",
      tripId: "trip-1",
      userId: "u1",
      flightNo: "EK449",
      origin: "SIN",
      dest: "AKL",
      depUtc: "2026-08-11T16:00:00.000Z",
      arrUtc: "2026-08-12T04:20:00.000Z",
      reportUtc: "2026-08-11T14:30:00.000Z",
      depTz: "Asia/Singapore",
      arrTz: "Pacific/Auckland",
      source: "manual",
      notes: null,
      legSeq: 1,
    },
  ],
};

// 3-day DXB->AKL->DXB trip, home base Asia/Dubai (origin of the first leg).
// first dep 2026-08-10 02:15 Dubai local; last arr 2026-08-12 18:00 Dubai local.
const inProgressTrip: TripWithFlights = {
  id: "trip-2",
  userId: "u1",
  label: null,
  createdAt: Date.parse("2026-08-09T00:00:00.000Z"),
  flights: [
    {
      id: "g1",
      tripId: "trip-2",
      userId: "u1",
      flightNo: "EK448",
      origin: "DXB",
      dest: "AKL",
      depUtc: "2026-08-09T22:15:00.000Z",
      arrUtc: "2026-08-10T16:20:00.000Z",
      reportUtc: "2026-08-09T20:45:00.000Z",
      depTz: "Asia/Dubai",
      arrTz: "Pacific/Auckland",
      source: "manual",
      notes: null,
      legSeq: 0,
    },
    {
      id: "g2",
      tripId: "trip-2",
      userId: "u1",
      flightNo: "EK449",
      origin: "AKL",
      dest: "DXB",
      depUtc: "2026-08-12T04:00:00.000Z",
      arrUtc: "2026-08-12T14:00:00.000Z",
      reportUtc: "2026-08-12T02:30:00.000Z",
      depTz: "Pacific/Auckland",
      arrTz: "Asia/Dubai",
      source: "manual",
      notes: null,
      legSeq: 1,
    },
  ],
};

describe("CrewHome", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the report time prominently and a relative countdown for the next duty", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);

    render(<CrewHome onAddTrip={vi.fn()} onOpenTrip={vi.fn()} onPickDay={vi.fn()} now={now} />);

    // REPORT box: prominent amber .num element showing the local report time at origin (DXB, Asia/Dubai, UTC+4).
    const reportTime = await screen.findByText("04:45");
    expect(reportTime.className).toContain("num");
    expect(reportTime.className).toContain("text-amber-num");

    // Status band / countdown text present.
    expect(screen.getByText(/next report/i)).toBeInTheDocument();
  });

  it("renders one row per upcoming duty", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);

    render(<CrewHome onAddTrip={vi.fn()} onOpenTrip={vi.fn()} onPickDay={vi.fn()} now={now} />);

    const rows = await screen.findAllByTestId("upcoming-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("EK448");
    expect(rows[1]).toHaveTextContent("EK449");
  });

  it("shows an empty state with an add-trip action when there are no trips", async () => {
    vi.mocked(getTrips).mockResolvedValue([]);
    const onAddTrip = vi.fn();

    render(<CrewHome onAddTrip={onAddTrip} onOpenTrip={vi.fn()} onPickDay={vi.fn()} now={now} />);

    expect(await screen.findByText(/no trips yet/i)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: /add your first/i });
    expect(button).toBeInTheDocument();
  });

  it("shows the active pairing progress card when a trip spans now, with correct day X of N", async () => {
    vi.mocked(getTrips).mockResolvedValue([inProgressTrip]);
    // Mid-trip: 2026-08-11T10:00:00Z is Aug 11 local in Asia/Dubai (home base), the 2nd of 3
    // local days spanned by the trip (first dep local day Aug 10, last arr local day Aug 12).
    const midTripNow = new Date("2026-08-11T10:00:00.000Z");

    render(<CrewHome onAddTrip={vi.fn()} onOpenTrip={vi.fn()} onPickDay={vi.fn()} now={midTripNow} />);

    const card = await screen.findByTestId("pairing-progress-card");
    expect(card).toHaveTextContent(/trip.*3 days/i);
    const dayLabel = await screen.findByText("day 2 of 3");
    expect(dayLabel.className).toContain("num");
    expect(card).toHaveTextContent("DXB");
    expect(card).toHaveTextContent("AKL");
  });

  it("does not show the pairing progress card for a fully future trip", async () => {
    vi.mocked(getTrips).mockResolvedValue([inProgressTrip]);
    // now is well before the trip's first departure.
    render(<CrewHome onAddTrip={vi.fn()} onOpenTrip={vi.fn()} onPickDay={vi.fn()} now={now} />);

    expect(screen.queryByTestId("pairing-progress-card")).not.toBeInTheDocument();
  });

  it("clicking an upcoming row calls onOpenTrip with that flight's trip", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const onOpenTrip = vi.fn();
    const user = userEvent.setup();

    render(<CrewHome onAddTrip={vi.fn()} onOpenTrip={onOpenTrip} onPickDay={vi.fn()} now={now} />);

    const [firstRow] = await screen.findAllByTestId("upcoming-row");
    await user.click(firstRow!);

    expect(onOpenTrip).toHaveBeenCalledWith(aklTrip);
  });

  it("clicking the next-duty card calls onOpenTrip with that flight's trip", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const onOpenTrip = vi.fn();
    const user = userEvent.setup();

    render(<CrewHome onAddTrip={vi.fn()} onOpenTrip={onOpenTrip} onPickDay={vi.fn()} now={now} />);

    await user.click(await screen.findByTestId("next-duty-card"));

    expect(onOpenTrip).toHaveBeenCalledWith(aklTrip);
  });

  it("defaults to the list view, showing upcoming rows and no calendar grid", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);

    render(<CrewHome onAddTrip={vi.fn()} onOpenTrip={vi.fn()} onPickDay={vi.fn()} now={now} />);

    await screen.findAllByTestId("upcoming-row");
    expect(screen.queryByTestId("calendar-next")).not.toBeInTheDocument();
  });

  it("switches to the calendar view when the Calendar segment is clicked, replacing the upcoming list", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const user = userEvent.setup();

    render(<CrewHome onAddTrip={vi.fn()} onOpenTrip={vi.fn()} onPickDay={vi.fn()} now={now} />);
    await screen.findAllByTestId("upcoming-row");

    await user.click(screen.getByRole("button", { name: /^calendar$/i }));

    expect(screen.getByTestId("calendar-next")).toBeInTheDocument();
    expect(screen.queryByTestId("upcoming-row")).not.toBeInTheDocument();
    // Next-duty card stays visible regardless of view.
    expect(screen.getByTestId("next-duty-card")).toBeInTheDocument();
  });

  it("persists the chosen view to localStorage and restores it on remount", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const user = userEvent.setup();

    const { unmount } = render(
      <CrewHome onAddTrip={vi.fn()} onOpenTrip={vi.fn()} onPickDay={vi.fn()} now={now} />,
    );
    await screen.findAllByTestId("upcoming-row");
    await user.click(screen.getByRole("button", { name: /^calendar$/i }));
    expect(localStorage.getItem("roster-view")).toBe("calendar");
    unmount();

    render(<CrewHome onAddTrip={vi.fn()} onOpenTrip={vi.fn()} onPickDay={vi.fn()} now={now} />);
    expect(await screen.findByTestId("calendar-next")).toBeInTheDocument();
  });

  it("defaults to list view when localStorage has no saved preference", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);

    render(<CrewHome onAddTrip={vi.fn()} onOpenTrip={vi.fn()} onPickDay={vi.fn()} now={now} />);

    await screen.findAllByTestId("upcoming-row");
  });

  it("calls onPickDay when a calendar day without a trip is tapped", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const onPickDay = vi.fn();
    const user = userEvent.setup();

    render(<CrewHome onAddTrip={vi.fn()} onOpenTrip={vi.fn()} onPickDay={onPickDay} now={now} />);
    await screen.findAllByTestId("upcoming-row");
    await user.click(screen.getByRole("button", { name: /^calendar$/i }));

    // now = 2026-08-10; pick a later day in the same month with no trip coverage.
    await user.click(screen.getByTestId("calendar-day-2026-08-20"));

    expect(onPickDay).toHaveBeenCalledWith("2026-08-20");
  });

  it("degrades to the default list view when localStorage.getItem throws (e.g. private-mode WebKit)", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("private mode: storage disabled");
    });

    render(<CrewHome onAddTrip={vi.fn()} onOpenTrip={vi.fn()} onPickDay={vi.fn()} now={now} />);

    await screen.findAllByTestId("upcoming-row");
    expect(screen.queryByTestId("calendar-next")).not.toBeInTheDocument();

    getItemSpy.mockRestore();
  });

  it("does not crash when localStorage.setItem throws while switching views", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const user = userEvent.setup();
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("private mode: storage disabled");
    });

    render(<CrewHome onAddTrip={vi.fn()} onOpenTrip={vi.fn()} onPickDay={vi.fn()} now={now} />);
    await screen.findAllByTestId("upcoming-row");

    await user.click(screen.getByRole("button", { name: /^calendar$/i }));
    expect(screen.getByTestId("calendar-next")).toBeInTheDocument();

    setItemSpy.mockRestore();
  });
});

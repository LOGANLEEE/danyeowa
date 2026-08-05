import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
  it("renders the report time prominently and a relative countdown for the next duty", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);

    render(<CrewHome onAddTrip={vi.fn()} onOpenTrip={vi.fn()} now={now} />);

    // REPORT box: prominent amber .num element showing the local report time at origin (DXB, Asia/Dubai, UTC+4).
    const reportTime = await screen.findByText("04:45");
    expect(reportTime.className).toContain("num");
    expect(reportTime.className).toContain("text-amber-num");

    // Status band / countdown text present.
    expect(screen.getByText(/next report/i)).toBeInTheDocument();
  });

  it("renders one row per upcoming duty", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);

    render(<CrewHome onAddTrip={vi.fn()} onOpenTrip={vi.fn()} now={now} />);

    const rows = await screen.findAllByTestId("upcoming-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("EK448");
    expect(rows[1]).toHaveTextContent("EK449");
  });

  it("shows an empty state with an add-trip action when there are no trips", async () => {
    vi.mocked(getTrips).mockResolvedValue([]);
    const onAddTrip = vi.fn();

    render(<CrewHome onAddTrip={onAddTrip} onOpenTrip={vi.fn()} now={now} />);

    expect(await screen.findByText(/no trips yet/i)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: /add your first/i });
    expect(button).toBeInTheDocument();
  });

  it("shows the active pairing progress card when a trip spans now, with correct day X of N", async () => {
    vi.mocked(getTrips).mockResolvedValue([inProgressTrip]);
    // Mid-trip: 2026-08-11T10:00:00Z is Aug 11 local in Asia/Dubai (home base), the 2nd of 3
    // local days spanned by the trip (first dep local day Aug 10, last arr local day Aug 12).
    const midTripNow = new Date("2026-08-11T10:00:00.000Z");

    render(<CrewHome onAddTrip={vi.fn()} onOpenTrip={vi.fn()} now={midTripNow} />);

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
    render(<CrewHome onAddTrip={vi.fn()} onOpenTrip={vi.fn()} now={now} />);

    expect(screen.queryByTestId("pairing-progress-card")).not.toBeInTheDocument();
  });

  it("clicking an upcoming row calls onOpenTrip with that flight's trip", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const onOpenTrip = vi.fn();
    const user = userEvent.setup();

    render(<CrewHome onAddTrip={vi.fn()} onOpenTrip={onOpenTrip} now={now} />);

    const [firstRow] = await screen.findAllByTestId("upcoming-row");
    await user.click(firstRow!);

    expect(onOpenTrip).toHaveBeenCalledWith(aklTrip);
  });

  it("clicking the next-duty card calls onOpenTrip with that flight's trip", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const onOpenTrip = vi.fn();
    const user = userEvent.setup();

    render(<CrewHome onAddTrip={vi.fn()} onOpenTrip={onOpenTrip} now={now} />);

    await user.click(await screen.findByTestId("next-duty-card"));

    expect(onOpenTrip).toHaveBeenCalledWith(aklTrip);
  });
});

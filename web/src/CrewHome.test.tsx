import { render, screen } from "@testing-library/react";
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

describe("CrewHome", () => {
  it("renders the report time prominently and a relative countdown for the next duty", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);

    render(<CrewHome onAddTrip={vi.fn()} now={now} />);

    // REPORT box: prominent amber .num element showing the local report time at origin (DXB, Asia/Dubai, UTC+4).
    const reportTime = await screen.findByText("04:45");
    expect(reportTime.className).toContain("num");
    expect(reportTime.className).toContain("text-amber-num");

    // Status band / countdown text present.
    expect(screen.getByText(/next report/i)).toBeInTheDocument();
  });

  it("renders one row per upcoming duty", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);

    render(<CrewHome onAddTrip={vi.fn()} now={now} />);

    const rows = await screen.findAllByTestId("upcoming-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("EK448");
    expect(rows[1]).toHaveTextContent("EK449");
  });

  it("shows an empty state with an add-trip action when there are no trips", async () => {
    vi.mocked(getTrips).mockResolvedValue([]);
    const onAddTrip = vi.fn();

    render(<CrewHome onAddTrip={onAddTrip} now={now} />);

    expect(await screen.findByText(/no trips yet/i)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: /add your first/i });
    expect(button).toBeInTheDocument();
  });
});

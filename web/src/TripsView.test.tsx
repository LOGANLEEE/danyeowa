import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TripsView from "./TripsView";
import { getTrips } from "./api";
import type { TripWithFlights } from "./api";

vi.mock("./api", () => ({
  getTrips: vi.fn(),
}));

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

describe("TripsView", () => {
  it("renders one row per upcoming duty", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);

    render(<TripsView onAddTrip={vi.fn()} onOpenTrip={vi.fn()} now={now} />);

    const rows = await screen.findAllByTestId("upcoming-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("EK448");
    expect(rows[1]).toHaveTextContent("EK449");
  });

  it("shows a 'next' chip on the first upcoming row only", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);

    render(<TripsView onAddTrip={vi.fn()} onOpenTrip={vi.fn()} now={now} />);

    const rows = await screen.findAllByTestId("upcoming-row");
    expect(rows[0]).toHaveTextContent(/next/i);
    expect(rows[1]).not.toHaveTextContent(/next/i);
  });

  it("shows an empty state with an add-trip action when there are no trips", async () => {
    vi.mocked(getTrips).mockResolvedValue([]);
    const onAddTrip = vi.fn();

    render(<TripsView onAddTrip={onAddTrip} onOpenTrip={vi.fn()} now={now} />);

    expect(await screen.findByText(/no trips yet/i)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: /add your first/i });
    expect(button).toBeInTheDocument();
  });

  it("clicking an upcoming row calls onOpenTrip with that flight's trip", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const onOpenTrip = vi.fn();
    const user = userEvent.setup();

    render(<TripsView onAddTrip={vi.fn()} onOpenTrip={onOpenTrip} now={now} />);

    const [firstRow] = await screen.findAllByTestId("upcoming-row");
    await user.click(firstRow!);

    expect(onOpenTrip).toHaveBeenCalledWith(aklTrip);
  });

  it("clicking Add trip calls onAddTrip when trips already exist", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const onAddTrip = vi.fn();
    const user = userEvent.setup();

    render(<TripsView onAddTrip={onAddTrip} onOpenTrip={vi.fn()} now={now} />);
    await screen.findAllByTestId("upcoming-row");

    await user.click(screen.getByRole("button", { name: /^add trip$/i }));

    expect(onAddTrip).toHaveBeenCalled();
  });
});

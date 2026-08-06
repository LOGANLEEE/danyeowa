import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CalendarHome from "./CalendarHome";
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

describe("CalendarHome", () => {
  it("renders the month calendar and a compact next-duty card", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);

    render(<CalendarHome onAddTrip={vi.fn()} onOpenTrip={vi.fn()} onPickDay={vi.fn()} now={now} />);

    // Calendar grid renders (chevrons + weekday row).
    expect(await screen.findByTestId("calendar-next")).toBeInTheDocument();
    expect(screen.getByText("Mon")).toBeInTheDocument();

    // Next-duty card: route chain + dates line, flight/trip-length muted line, report line.
    const card = screen.getByTestId("next-duty-card");
    expect(card).toHaveTextContent("DXB → AKL");
    expect(card).toHaveTextContent("EK448");
    expect(card).toHaveTextContent(/trip 2 days/i);

    const reportTime = await screen.findByText("04:45");
    expect(reportTime.className).toContain("num");
    expect(reportTime.className).toContain("text-report");
    expect(card).toHaveTextContent(/leave home/i);
  });

  it("marks a trip day on the grid", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);

    render(<CalendarHome onAddTrip={vi.fn()} onOpenTrip={vi.fn()} onPickDay={vi.fn()} now={now} />);

    const day = await screen.findByTestId("calendar-day-2026-08-11");
    expect(day.className).toContain("bg-accent-soft");
  });

  it("shows an empty state with an add-trip action when there are no trips", async () => {
    vi.mocked(getTrips).mockResolvedValue([]);
    const onAddTrip = vi.fn();

    render(<CalendarHome onAddTrip={onAddTrip} onOpenTrip={vi.fn()} onPickDay={vi.fn()} now={now} />);

    expect(await screen.findByText(/no trips yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add your first/i })).toBeInTheDocument();
  });

  it("clicking the next-duty card calls onOpenTrip with that flight's trip", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const onOpenTrip = vi.fn();
    const user = userEvent.setup();

    render(<CalendarHome onAddTrip={vi.fn()} onOpenTrip={onOpenTrip} onPickDay={vi.fn()} now={now} />);

    await user.click(await screen.findByTestId("next-duty-card"));

    expect(onOpenTrip).toHaveBeenCalledWith(aklTrip);
  });

  it("calls onPickDay when a calendar day without a trip is tapped", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const onPickDay = vi.fn();
    const user = userEvent.setup();

    render(<CalendarHome onAddTrip={vi.fn()} onOpenTrip={vi.fn()} onPickDay={onPickDay} now={now} />);
    await screen.findByTestId("calendar-next");

    // now = 2026-08-10; pick a later day in the same month with no trip coverage.
    await user.click(screen.getByTestId("calendar-day-2026-08-20"));

    expect(onPickDay).toHaveBeenCalledWith("2026-08-20");
  });

  it("calls onOpenTrip when tapping a trip day on the grid", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const onOpenTrip = vi.fn();
    const user = userEvent.setup();

    render(<CalendarHome onAddTrip={vi.fn()} onOpenTrip={onOpenTrip} onPickDay={vi.fn()} now={now} />);

    await user.click(await screen.findByTestId("calendar-day-2026-08-11"));

    expect(onOpenTrip).toHaveBeenCalledWith(aklTrip);
  });
});

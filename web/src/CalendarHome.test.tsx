import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CalendarHome from "./CalendarHome";
import { confirmSchedule, createTrip, getTrips, lookupSchedule } from "./api";
import type { TripWithFlights } from "./api";

vi.mock("./api", () => ({
  getTrips: vi.fn(),
  createTrip: vi.fn(),
  getAirport: vi.fn(),
  lookupSchedule: vi.fn(),
  confirmSchedule: vi.fn(),
  deleteTrip: vi.fn(),
  patchFlight: vi.fn(),
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

describe("CalendarHome", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(getTrips).mockClear();
  });

  it("renders the month calendar and a compact next-duty card", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);

    render(<CalendarHome now={now} />);

    // Calendar grid renders (chevrons + weekday row).
    expect(await screen.findByTestId("calendar-next")).toBeInTheDocument();
    expect(screen.getByText("Mon")).toBeInTheDocument();

    // Next-duty card: FULL route chain (every stop, not just endpoints) + dates line,
    // flight/trip-length muted line, report line.
    const card = screen.getByTestId("next-duty-card");
    expect(card).toHaveTextContent("DXB → SIN → AKL");
    expect(card).toHaveTextContent("EK448");
    expect(card).toHaveTextContent(/trip 2 days/i);

    const reportTime = await screen.findByText("04:45");
    expect(reportTime.className).toContain("num");
    expect(reportTime.className).toContain("text-report");
    expect(card).toHaveTextContent(/leave home/i);
  });

  it("marks a trip day on the grid", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);

    render(<CalendarHome now={now} />);

    const day = await screen.findByTestId("calendar-day-2026-08-11");
    expect(day.className).toContain("bg-accent-soft");
  });

  it("shows an empty state with an add-trip action that opens the day sheet", async () => {
    vi.mocked(getTrips).mockResolvedValue([]);
    const user = userEvent.setup();

    render(<CalendarHome now={now} />);

    expect(await screen.findByText(/no trips yet/i)).toBeInTheDocument();
    const addButton = screen.getByRole("button", { name: /add your first/i });
    expect(addButton).toBeInTheDocument();

    await user.click(addButton);
    expect(await screen.findByTestId("day-sheet")).toBeInTheDocument();
  });

  it("clicking the next-duty card opens the day sheet showing that trip", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const user = userEvent.setup();

    render(<CalendarHome now={now} />);

    await user.click(await screen.findByTestId("next-duty-card"));

    const sheet = await screen.findByTestId("day-sheet");
    expect(sheet).toHaveTextContent("EK448");
    expect(sheet).toHaveTextContent("EK449");
  });

  it("single tap on an empty calendar day selects it and shows a no-duty detail card with an Add trip button", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const user = userEvent.setup();

    render(<CalendarHome now={now} />);
    await screen.findByTestId("calendar-next");

    // now = 2026-08-10; pick a later day in the same month with no trip coverage.
    await user.click(screen.getByTestId("calendar-day-2026-08-20"));

    const detail = await screen.findByTestId("day-detail-card");
    expect(detail).toHaveTextContent(/no duty/i);
    expect(screen.getByTestId("day-detail-action")).toHaveTextContent(/add trip/i);
    expect(screen.queryByTestId("day-sheet")).not.toBeInTheDocument();
    // Selecting a day replaces the next-duty card.
    expect(screen.queryByTestId("next-duty-card")).not.toBeInTheDocument();
  });

  it("second tap on the already-selected empty day opens the day sheet's add flow", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const user = userEvent.setup();

    render(<CalendarHome now={now} />);
    await screen.findByTestId("calendar-next");

    await user.click(screen.getByTestId("calendar-day-2026-08-20"));
    await screen.findByTestId("day-detail-card");
    await user.click(screen.getByTestId("calendar-day-2026-08-20"));

    const sheet = await screen.findByTestId("day-sheet");
    expect(sheet).toHaveTextContent(/add trip/i);
    expect(screen.getByTestId("flightno-input")).toBeInTheDocument();
  });

  it("single tap on a trip day selects it and shows a trip detail card with an Edit trip button", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const user = userEvent.setup();

    render(<CalendarHome now={now} />);

    await user.click(await screen.findByTestId("calendar-day-2026-08-11"));

    const detail = await screen.findByTestId("day-detail-card");
    expect(detail).toHaveTextContent("DXB → SIN → AKL");
    expect(detail).toHaveTextContent("EK448");
    expect(screen.getByTestId("day-detail-action")).toHaveTextContent(/edit trip/i);
    expect(screen.queryByTestId("day-sheet")).not.toBeInTheDocument();
  });

  it("second tap on the already-selected trip day opens the day sheet showing that trip", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const user = userEvent.setup();

    render(<CalendarHome now={now} />);

    await user.click(await screen.findByTestId("calendar-day-2026-08-11"));
    await screen.findByTestId("day-detail-card");
    await user.click(screen.getByTestId("calendar-day-2026-08-11"));

    const sheet = await screen.findByTestId("day-sheet");
    expect(sheet).toHaveTextContent("EK448");
  });

  it("the detail card's action button also opens the day sheet directly", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const user = userEvent.setup();

    render(<CalendarHome now={now} />);

    await user.click(await screen.findByTestId("calendar-day-2026-08-11"));
    await screen.findByTestId("day-detail-card");
    await user.click(screen.getByTestId("day-detail-action"));

    const sheet = await screen.findByTestId("day-sheet");
    expect(sheet).toHaveTextContent("EK448");
  });

  it("tapping a different day switches the selection instead of opening the sheet", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const user = userEvent.setup();

    render(<CalendarHome now={now} />);

    await user.click(await screen.findByTestId("calendar-day-2026-08-11"));
    await screen.findByTestId("day-detail-card");
    await user.click(screen.getByTestId("calendar-day-2026-08-20"));

    const detail = await screen.findByTestId("day-detail-card");
    expect(detail).toHaveTextContent(/no duty/i);
    expect(screen.queryByTestId("day-sheet")).not.toBeInTheDocument();
  });

  it("keeps the detail card up with no dismiss button, switching it as other days are tapped", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const user = userEvent.setup();

    render(<CalendarHome now={now} />);

    await user.click(await screen.findByTestId("calendar-day-2026-08-11"));
    await screen.findByTestId("day-detail-card");
    expect(screen.queryByTestId("day-detail-clear")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("calendar-day-2026-08-20"));
    expect(await screen.findByTestId("day-detail-card")).toHaveTextContent(/no duty/i);
  });

  it("shows the active pairing progress card when a trip spans now, with correct day X of N", async () => {
    vi.mocked(getTrips).mockResolvedValue([inProgressTrip]);
    // Mid-trip: 2026-08-11T10:00:00Z is Aug 11 local in Asia/Dubai (home base), the 2nd of 3
    // local days spanned by the trip (first dep local day Aug 10, last arr local day Aug 12).
    const midTripNow = new Date("2026-08-11T10:00:00.000Z");

    render(<CalendarHome now={midTripNow} />);

    const card = await screen.findByTestId("pairing-progress-card");
    expect(card).toHaveTextContent(/trip.*3 days/i);
    const dayLabel = await screen.findByText("day 2 of 3");
    expect(dayLabel.className).toContain("num");
    expect(card).toHaveTextContent("DXB");
    expect(card).toHaveTextContent("AKL");
  });

  it("does not show the pairing progress card for a fully future trip", async () => {
    vi.mocked(getTrips).mockResolvedValue([inProgressTrip]);
    // Genuinely before the trip's first departure (2026-08-09T22:15:00.000Z) - not the
    // module-level `now`, which is actually mid-trip for this fixture.
    const fullyFutureNow = new Date("2026-08-01T00:00:00.000Z");
    render(<CalendarHome now={fullyFutureNow} />);

    await screen.findByTestId("next-duty-card");
    expect(screen.queryByTestId("pairing-progress-card")).not.toBeInTheDocument();
  });

  it("opens the day sheet for today when openTodayToken changes and today is trip-free", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const { rerender } = render(<CalendarHome now={now} openTodayToken={0} />);
    await screen.findByTestId("next-duty-card");

    rerender(<CalendarHome now={now} openTodayToken={1} />);

    const sheet = await screen.findByTestId("day-sheet");
    expect(sheet).toHaveTextContent(/add trip/i);
  });

  it("marks a day optimistically after an add, without refetching, then refetches once on Done", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    vi.mocked(lookupSchedule).mockResolvedValue({
      legs: [
        {
          legSeq: 0,
          origin: "DXB",
          dest: "LHR",
          depLocal: "09:15",
          arrLocal: "13:35",
          dayOffset: 0,
          originTz: "Asia/Dubai",
          destTz: "Europe/London",
          confirmCount: 3,
        },
      ],
    });
    vi.mocked(createTrip).mockImplementation(async () => ({
      id: "trip-added",
      userId: "u1",
      label: null,
      createdAt: Date.now(),
      flights: [],
    }));
    vi.mocked(confirmSchedule).mockResolvedValue(undefined);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<CalendarHome now={now} />);
    await screen.findByTestId("calendar-next");

    await user.click(screen.getByTestId("calendar-day-2026-08-20"));
    await screen.findByTestId("day-detail-card");
    await user.click(screen.getByTestId("calendar-day-2026-08-20"));
    await screen.findByTestId("day-sheet");

    expect(getTrips).toHaveBeenCalledTimes(1);

    await user.type(screen.getByTestId("flightno-input"), "ek001");
    await vi.advanceTimersByTimeAsync(400);
    await screen.findByTestId("autofill-card");
    await user.click(screen.getByRole("button", { name: /add to roster/i }));
    await waitFor(() => expect(createTrip).toHaveBeenCalled());
    await screen.findByTestId("rapid-banner");

    // No refetch fired by the add itself.
    expect(getTrips).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId("done-button"));
    await waitFor(() => expect(getTrips).toHaveBeenCalledTimes(2));

    vi.useRealTimers();
  });

  it("hides the stale 'No trips yet' empty state and its CTA once a day is marked optimistically (fresh account, first add)", async () => {
    vi.mocked(getTrips).mockResolvedValue([]);
    vi.mocked(confirmSchedule).mockResolvedValue(undefined);
    vi.mocked(lookupSchedule).mockResolvedValue({
      legs: [
        {
          legSeq: 0,
          origin: "DXB",
          dest: "LHR",
          depLocal: "09:15",
          arrLocal: "13:35",
          dayOffset: 0,
          originTz: "Asia/Dubai",
          destTz: "Europe/London",
          confirmCount: 3,
        },
      ],
    });
    vi.mocked(createTrip).mockResolvedValue({
      id: "trip-fresh",
      userId: "u1",
      label: null,
      createdAt: Date.now(),
      flights: [
        {
          id: "fresh-f1",
          tripId: "trip-fresh",
          userId: "u1",
          flightNo: "EK001",
          origin: "DXB",
          dest: "LHR",
          depUtc: "2026-08-20T05:15:00.000Z",
          arrUtc: "2026-08-20T12:35:00.000Z",
          reportUtc: "2026-08-20T03:45:00.000Z",
          depTz: "Asia/Dubai",
          arrTz: "Europe/London",
          source: "manual",
          notes: null,
          legSeq: 0,
        },
      ],
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<CalendarHome now={now} />);
    expect(await screen.findByText(/no trips yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add your first/i })).toBeInTheDocument();

    await user.click(screen.getByTestId("calendar-day-2026-08-20"));
    await screen.findByTestId("day-detail-card");
    await user.click(screen.getByTestId("calendar-day-2026-08-20"));
    await user.type(screen.getByTestId("flightno-input"), "ek001");
    await vi.advanceTimersByTimeAsync(400);
    await screen.findByTestId("autofill-card");
    await user.click(screen.getByRole("button", { name: /add to roster/i }));
    await screen.findByTestId("rapid-banner");

    // The sheet is still open (rapid-entry chaining), but the empty-state text/CTA behind
    // it must be gone now that a day has been marked optimistically - trips is still []
    // (no refetch until Done), so without this fix the stale empty state would still show.
    expect(screen.queryByText(/no trips yet/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add your first/i })).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it("skips to the next trip-free day when today already has a trip", async () => {
    vi.mocked(getTrips).mockResolvedValue([inProgressTrip]);
    // now falls on inProgressTrip's away span (2026-08-09..2026-08-12 Asia/Dubai).
    const { rerender } = render(<CalendarHome now={new Date("2026-08-10T10:00:00.000Z")} openTodayToken={0} />);
    await screen.findByTestId("next-duty-card");

    rerender(<CalendarHome now={new Date("2026-08-10T10:00:00.000Z")} openTodayToken={1} />);

    const sheet = await screen.findByTestId("day-sheet");
    // Skips past the trip's away days (through 2026-08-12) to the first free day after - this
    // is the add flow (flight-no input), not an existing-trip summary (no delete/edit control
    // for EK448's trip). Recent-flight chips legitimately surface past flight numbers like
    // EK448 as one-tap suggestions, so a bare "not EK448 text anywhere" check would now be a
    // false positive for the actual regression this guards against.
    expect(sheet).toHaveTextContent(/add trip/i);
    expect(screen.getByTestId("flightno-input")).toBeInTheDocument();
    expect(screen.queryByTestId("delete-trip")).not.toBeInTheDocument();
  });
});

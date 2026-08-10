import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CalendarHome from "./CalendarHome";
import { confirmSchedule, createTrip, deleteTrip, getTrips, lookupSchedule } from "./api";
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

    // Next-duty card: FULL route chain (every stop, not just endpoints) + flight/trip-length
    // muted line, then the departure-board rows (REPORT/DEP/ARR) and the duration.
    const card = screen.getByTestId("next-duty-card");
    expect(card).toHaveTextContent("DXB → SIN → AKL");
    expect(card).toHaveTextContent("EK448 · Tue 11 Aug · 2 days");
    expect(card).toHaveTextContent(/report/i);
    expect(card).toHaveTextContent("04:45"); // report: firstLeg.reportUtc in Asia/Dubai
    expect(card).toHaveTextContent("06:15"); // dep: firstLeg.depUtc in Asia/Dubai
    expect(card).toHaveTextContent("16:20"); // arr: lastLeg.arrUtc in Pacific/Auckland
    expect(card).toHaveTextContent("+1"); // arrival lands a calendar day later
    expect(card).toHaveTextContent("1d 2h"); // elapsed time, kept from the old sector rail
    expect(card).not.toHaveTextContent(/leave home/i);
  });

  it("marks a trip day on the grid", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);

    render(<CalendarHome now={now} />);

    const day = await screen.findByTestId("calendar-day-2026-08-11");
    expect(day.className).toContain("bg-accent-soft");
  });

  it("shows an empty state with an add-trip action that selects today and shows the inline add form", async () => {
    vi.mocked(getTrips).mockResolvedValue([]);
    const user = userEvent.setup();

    render(<CalendarHome now={now} />);

    expect(await screen.findByText(/no trips yet/i)).toBeInTheDocument();
    const addButton = screen.getByRole("button", { name: /add your first/i });
    expect(addButton).toBeInTheDocument();

    await user.click(addButton);
    expect(await screen.findByTestId("flightno-input")).toBeInTheDocument();
  });

  it("single tap on an empty calendar day selects it and shows a no-duty detail card with the inline add-trip form", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const user = userEvent.setup();

    render(<CalendarHome now={now} />);
    await screen.findByTestId("calendar-next");

    // now = 2026-08-10; pick a later day in the same month with no trip coverage.
    await user.click(screen.getByTestId("calendar-day-2026-08-20"));

    const detail = await screen.findByTestId("day-detail-card");
    expect(detail).toHaveTextContent(/no duty/i);
    // No "Add trip" button to press first - the flight-no input is right there, one tap in.
    expect(screen.getByTestId("flightno-input")).toBeInTheDocument();
    // Selecting a day replaces the next-duty card.
    expect(screen.queryByTestId("next-duty-card")).not.toBeInTheDocument();
  });

  it("single tap on a trip day selects it and shows a trip detail card with an Edit trip button", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const user = userEvent.setup();

    render(<CalendarHome now={now} />);

    await user.click(await screen.findByTestId("calendar-day-2026-08-11"));

    const detail = await screen.findByTestId("day-detail-card");
    expect(detail).toHaveTextContent("DXB → SIN → AKL");
    expect(detail).toHaveTextContent("EK448");
    // Icon-only button now - identify by its aria-label, not text content.
    expect(screen.getByTestId("day-detail-action")).toHaveAttribute("aria-label", "Edit trip");
  });

  it("tapping the next-duty card selects that duty's day, showing its detail card in place", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const user = userEvent.setup();

    render(<CalendarHome now={now} />);

    await user.click(await screen.findByTestId("next-duty-card"));

    const detail = await screen.findByTestId("day-detail-card");
    expect(detail).toHaveTextContent("EK448");
    expect(screen.getByTestId("day-detail-action")).toHaveAttribute("aria-label", "Edit trip");
  });

  it("second tap on the already-selected trip day keeps its detail card up (trip days expand in place)", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const user = userEvent.setup();

    render(<CalendarHome now={now} />);

    await user.click(await screen.findByTestId("calendar-day-2026-08-11"));
    await screen.findByTestId("day-detail-card");
    await user.click(screen.getByTestId("calendar-day-2026-08-11"));

    expect(screen.getByTestId("day-detail-card")).toHaveTextContent("EK448");
  });

  it("the detail card's action button expands a trip day in place (trip-legs-panel)", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const user = userEvent.setup();

    render(<CalendarHome now={now} />);

    await user.click(await screen.findByTestId("calendar-day-2026-08-11"));
    await screen.findByTestId("day-detail-card");

    expect(screen.queryByTestId("trip-legs-panel")).not.toBeInTheDocument();
    const action = screen.getByTestId("day-detail-action");
    expect(action).toHaveAttribute("aria-expanded", "false");

    await user.click(action);

    expect(await screen.findByTestId("trip-legs-panel")).toBeInTheDocument();
    expect(action).toHaveAttribute("aria-expanded", "true");
    expect(action).toHaveAttribute("aria-label", "Hide flight details");
  });

  it("tapping a different day switches the selection", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const user = userEvent.setup();

    render(<CalendarHome now={now} />);

    await user.click(await screen.findByTestId("calendar-day-2026-08-11"));
    await screen.findByTestId("day-detail-card");
    await user.click(screen.getByTestId("calendar-day-2026-08-20"));

    const detail = await screen.findByTestId("day-detail-card");
    expect(detail).toHaveTextContent(/no duty/i);
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

  it("selects today when openTodayToken changes and today is trip-free, showing the inline add form", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const { rerender } = render(<CalendarHome now={now} openTodayToken={0} />);
    await screen.findByTestId("next-duty-card");

    rerender(<CalendarHome now={now} openTodayToken={1} />);

    const detail = await screen.findByTestId("day-detail-card");
    expect(detail).toHaveTextContent(/no duty/i);
    expect(screen.getByTestId("flightno-input")).toBeInTheDocument();
  });

  it("skips to the next trip-free day when today already has a trip", async () => {
    vi.mocked(getTrips).mockResolvedValue([inProgressTrip]);
    // now falls on inProgressTrip's away span (2026-08-09..2026-08-12 Asia/Dubai).
    const { rerender } = render(<CalendarHome now={new Date("2026-08-10T10:00:00.000Z")} openTodayToken={0} />);
    await screen.findByTestId("next-duty-card");

    rerender(<CalendarHome now={new Date("2026-08-10T10:00:00.000Z")} openTodayToken={1} />);

    const detail = await screen.findByTestId("day-detail-card");
    // Skips past the trip's away days (through 2026-08-12) to the first free day after - this
    // is the add flow (flight-no input), not an existing-trip summary (no delete/edit control
    // for EK448's trip). Recent-flight chips legitimately surface past flight numbers like
    // EK448 as one-tap suggestions, so a bare "not EK448 text anywhere" check would now be a
    // false positive for the actual regression this guards against.
    expect(detail).toHaveTextContent(/no duty/i);
    expect(screen.getByTestId("flightno-input")).toBeInTheDocument();
    expect(screen.queryByTestId("delete-trip")).not.toBeInTheDocument();
  });

  it("delete-trip -> confirm-delete on the day card deletes the trip and refetches", async () => {
    vi.mocked(getTrips).mockResolvedValueOnce([aklTrip]);
    vi.mocked(deleteTrip).mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<CalendarHome now={now} />);

    await user.click(await screen.findByTestId("calendar-day-2026-08-11"));
    await screen.findByTestId("day-detail-card");

    // Delete lives on the card header itself - no need to expand first.
    await user.click(screen.getByTestId("delete-trip"));
    expect(screen.getByText(/can't be undone/i)).toBeInTheDocument();

    vi.mocked(getTrips).mockResolvedValueOnce([]);
    await user.click(screen.getByTestId("confirm-delete"));

    await waitFor(() => expect(deleteTrip).toHaveBeenCalledWith("trip-1"));
    // onChanged -> refetch: a second getTrips call beyond the initial render.
    await waitFor(() => expect(getTrips).toHaveBeenCalledTimes(2));
  });

  it("a delete failure from the day card shows an alert and keeps the confirm row open", async () => {
    vi.mocked(getTrips).mockResolvedValueOnce([aklTrip]);
    vi.mocked(deleteTrip).mockRejectedValue(new Error("network error"));
    const user = userEvent.setup();

    render(<CalendarHome now={now} />);

    await user.click(await screen.findByTestId("calendar-day-2026-08-11"));
    await screen.findByTestId("day-detail-card");

    await user.click(screen.getByTestId("delete-trip"));
    await user.click(screen.getByTestId("confirm-delete"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/network error/i);
    expect(screen.getByTestId("confirm-delete")).toBeInTheDocument();
  });

  // The lookup response shape a successful flight-code edit re-runs against.
  const EK449_LEGS = [
    {
      legSeq: 0,
      origin: "DXB",
      dest: "SIN",
      depLocal: "06:15",
      arrLocal: "17:35",
      dayOffset: 0,
      originTz: "Asia/Dubai",
      destTz: "Asia/Singapore",
      confirmCount: 1,
    },
  ];

  it("pencil enters edit mode with the flight-number field prefilled with the current flight number", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    const user = userEvent.setup();

    render(<CalendarHome now={now} />);

    await user.click(await screen.findByTestId("calendar-day-2026-08-11"));
    await screen.findByTestId("day-detail-card");
    await user.click(screen.getByTestId("day-detail-action"));

    expect(await screen.findByTestId("card-edit-flightno")).toHaveValue("448");
  });

  it("a successful edit save creates the replacement trip, deletes the original in that order, then refetches", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(getTrips).mockResolvedValueOnce([aklTrip]);
    vi.mocked(getTrips).mockResolvedValueOnce([]);
    vi.mocked(lookupSchedule).mockReset();
    vi.mocked(lookupSchedule).mockResolvedValue({ legs: EK449_LEGS });
    vi.mocked(createTrip).mockReset();
    vi.mocked(deleteTrip).mockReset();
    // The save fires a fire-and-forget confirmSchedule() per leg, chained with .catch() -
    // it must resolve to an actual promise or that chain throws before onSubmitted runs.
    vi.mocked(confirmSchedule).mockReset();
    vi.mocked(confirmSchedule).mockResolvedValue(undefined);
    const callOrder: string[] = [];
    vi.mocked(createTrip).mockImplementation(async () => {
      callOrder.push("create");
      return { ...aklTrip, id: "trip-new" };
    });
    vi.mocked(deleteTrip).mockImplementation(async () => {
      callOrder.push("delete");
    });

    render(<CalendarHome now={now} />);

    await user.click(await screen.findByTestId("calendar-day-2026-08-11"));
    await screen.findByTestId("day-detail-card");
    await user.click(screen.getByTestId("day-detail-action"));

    const input = await screen.findByTestId("card-edit-flightno");
    await user.clear(input);
    await user.type(input, "449");
    await vi.advanceTimersByTimeAsync(400);

    await waitFor(() => expect(screen.getByTestId("card-edit-save")).not.toBeDisabled());
    await user.click(screen.getByTestId("card-edit-save"));

    await waitFor(() => expect(deleteTrip).toHaveBeenCalledWith("trip-1"));
    expect(callOrder).toEqual(["create", "delete"]);
    // onSubmitted's own refetch (onChanged), on top of the initial mount fetch.
    await waitFor(() => expect(getTrips).toHaveBeenCalledTimes(2));
  });

  it("a failed create during an edit does not delete the original trip", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    vi.mocked(lookupSchedule).mockReset();
    vi.mocked(lookupSchedule).mockResolvedValue({ legs: EK449_LEGS });
    vi.mocked(createTrip).mockReset();
    vi.mocked(createTrip).mockRejectedValue(new Error("network error"));
    vi.mocked(deleteTrip).mockReset();

    render(<CalendarHome now={now} />);

    await user.click(await screen.findByTestId("calendar-day-2026-08-11"));
    await screen.findByTestId("day-detail-card");
    await user.click(screen.getByTestId("day-detail-action"));

    const input = await screen.findByTestId("card-edit-flightno");
    await user.clear(input);
    await user.type(input, "449");
    await vi.advanceTimersByTimeAsync(400);

    await waitFor(() => expect(screen.getByTestId("card-edit-save")).not.toBeDisabled());
    await user.click(screen.getByTestId("card-edit-save"));

    await waitFor(() => expect(createTrip).toHaveBeenCalled());
    expect(deleteTrip).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/network error/i);
    // A failed create keeps edit mode open rather than discarding the in-progress edit.
    expect(screen.getByTestId("card-edit-flightno")).toBeInTheDocument();
  });

  it("cancel from edit mode leaves the trip untouched", async () => {
    vi.mocked(getTrips).mockResolvedValue([aklTrip]);
    vi.mocked(createTrip).mockReset();
    vi.mocked(deleteTrip).mockReset();
    const user = userEvent.setup();

    render(<CalendarHome now={now} />);

    await user.click(await screen.findByTestId("calendar-day-2026-08-11"));
    await screen.findByTestId("day-detail-card");
    await user.click(screen.getByTestId("day-detail-action"));
    await screen.findByTestId("card-edit-flightno");

    await user.click(screen.getByTestId("card-edit-cancel"));

    expect(screen.queryByTestId("card-edit-flightno")).not.toBeInTheDocument();
    expect(createTrip).not.toHaveBeenCalled();
    expect(deleteTrip).not.toHaveBeenCalled();
    expect(screen.getByTestId("day-detail-card")).toHaveTextContent("EK448");
    expect(getTrips).toHaveBeenCalledTimes(1);
  });

  it("adding a trip inline on an empty day's card clears the form and flips the card to the trip view once the refetch resolves", async () => {
    // Trip landing on the SAME calendar cell (2026-08-20, Asia/Dubai local) the test taps -
    // stands in for whatever the (mocked) createTrip call actually saved, since only the
    // parent's own refetch (not createTrip's return value) drives the card switch. The add-trip
    // form lives directly on the day-detail card (no bottom sheet) - this exercises the
    // CalendarHome <-> AddTripForm wiring end to end, not AddTripForm's own internals (covered
    // by AddTripForm.test.tsx).
    const addedTrip: TripWithFlights = {
      id: "trip-new",
      userId: "u1",
      label: null,
      createdAt: Date.now(),
      flights: [
        {
          id: "new-f1",
          tripId: "trip-new",
          userId: "u1",
          flightNo: "EK449",
          origin: "DXB",
          dest: "SIN",
          depUtc: "2026-08-20T02:15:00.000Z",
          arrUtc: "2026-08-20T13:35:00.000Z",
          reportUtc: "2026-08-20T00:45:00.000Z",
          depTz: "Asia/Dubai",
          arrTz: "Asia/Singapore",
          source: "manual",
          notes: null,
          legSeq: 0,
        },
      ],
    };
    let resolveSecondFetch!: (trips: TripWithFlights[]) => void;
    vi.mocked(getTrips)
      .mockResolvedValueOnce([])
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecondFetch = resolve;
          }),
      );
    vi.mocked(lookupSchedule).mockResolvedValue({ legs: EK449_LEGS });
    vi.mocked(createTrip).mockResolvedValue(addedTrip);
    vi.mocked(confirmSchedule).mockResolvedValue(undefined);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<CalendarHome now={now} />);
    await user.click(await screen.findByTestId("calendar-day-2026-08-20"));

    const flightInput = await screen.findByTestId("flightno-input");
    await user.type(flightInput, "449");
    await vi.advanceTimersByTimeAsync(400);
    await screen.findByTestId("autofill-card");

    await user.click(screen.getByRole("button", { name: /add to roster/i }));

    // The parent's refetch is still pending (deliberately unresolved above) - the day-detail
    // card must already be showing a FRESH, blank form rather than the just-submitted preview.
    await waitFor(() => expect(screen.getByTestId("flightno-input")).toHaveValue(""));
    expect(screen.queryByTestId("autofill-card")).not.toBeInTheDocument();

    // Once the refetch resolves with the new trip, the card flips over to the trip view.
    resolveSecondFetch([addedTrip]);
    await waitFor(() => expect(screen.getByTestId("delete-trip")).toBeInTheDocument());
  });
});

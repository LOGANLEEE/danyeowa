import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DaySheet, { humanDateLabel } from "./DaySheet";
import {
  confirmSchedule,
  createTrip,
  deleteTrip,
  getAirport,
  lookupSchedule,
  patchFlight,
  suggestReturns,
} from "./api";
import type { TripWithFlights } from "./api";

describe("humanDateLabel", () => {
  it("formats a local ISO date as weekday short + day + month short", () => {
    expect(humanDateLabel("2026-08-20", "Asia/Dubai")).toBe("Thu 20 Aug");
  });

  it("uses the given home tz's own calendar, not UTC's", () => {
    // 2026-08-20 noon UTC is already 2026-08-21 early morning in Pacific/Auckland
    // (UTC+12), proving the tz argument actually shifts the rendered calendar date.
    expect(humanDateLabel("2026-08-20", "Pacific/Auckland")).toBe("Fri 21 Aug");
  });
});

vi.mock("./api", () => ({
  createTrip: vi.fn(),
  getAirport: vi.fn(),
  lookupSchedule: vi.fn(),
  confirmSchedule: vi.fn(),
  deleteTrip: vi.fn(),
  patchFlight: vi.fn(),
  suggestReturns: vi.fn(),
}));

const trip: TripWithFlights = {
  id: "trip-1",
  userId: "u1",
  label: null,
  createdAt: Date.now(),
  flights: [
    {
      id: "f1",
      tripId: "trip-1",
      userId: "u1",
      flightNo: "EK002",
      origin: "DXB",
      dest: "LHR",
      depUtc: "2026-08-11T02:15:00.000Z",
      arrUtc: "2026-08-11T07:30:00.000Z",
      reportUtc: "2026-08-11T00:45:00.000Z",
      depTz: "Asia/Dubai",
      arrTz: "Europe/London",
      source: "manual",
      notes: null,
      legSeq: 0,
    },
  ],
};

describe("DaySheet", () => {
  beforeEach(() => {
    vi.mocked(createTrip).mockReset();
    vi.mocked(getAirport).mockReset();
    vi.mocked(lookupSchedule).mockReset();
    vi.mocked(confirmSchedule).mockReset();
    vi.mocked(confirmSchedule).mockResolvedValue(undefined);
    vi.mocked(deleteTrip).mockReset();
    vi.mocked(patchFlight).mockReset();
    vi.mocked(suggestReturns).mockReset();
    vi.mocked(suggestReturns).mockResolvedValue({ suggestions: [] });
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a dialog with a day title reflecting the empty-day add flow", () => {
    render(
      <DaySheet isoDate="2026-08-20" trip={null} trips={[]} homeTz="Asia/Dubai" onClose={vi.fn()} onChanged={vi.fn()} onAdded={vi.fn()} />,
    );
    expect(screen.getByTestId("day-sheet")).toBeInTheDocument();
    expect(screen.getByText(/add trip/i)).toBeInTheDocument();
  });

  it("dismisses when the scrim is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onClose = vi.fn();
    render(
      <DaySheet isoDate="2026-08-20" trip={null} trips={[]} homeTz="Asia/Dubai" onClose={onClose} onChanged={vi.fn()} onAdded={vi.fn()} />,
    );

    await user.click(screen.getByTestId("sheet-scrim"));
    expect(onClose).toHaveBeenCalled();
  });

  it("dismisses when the close button is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onClose = vi.fn();
    render(
      <DaySheet isoDate="2026-08-20" trip={null} trips={[]} homeTz="Asia/Dubai" onClose={onClose} onChanged={vi.fn()} onAdded={vi.fn()} />,
    );

    await user.click(screen.getByTestId("sheet-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("dismisses on Escape", () => {
    const onClose = vi.fn();
    render(
      <DaySheet isoDate="2026-08-20" trip={null} trips={[]} homeTz="Asia/Dubai" onClose={onClose} onChanged={vi.fn()} onAdded={vi.fn()} />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("refetches exactly once when dismissed (scrim, close button, or Escape all route through the same dismiss)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onChanged = vi.fn();
    render(
      <DaySheet isoDate="2026-08-20" trip={null} trips={[]} homeTz="Asia/Dubai" onClose={vi.fn()} onChanged={onChanged} onAdded={vi.fn()} />,
    );

    await user.click(screen.getByTestId("sheet-close"));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the sheet on open and restores it on close", () => {
    const outsideButton = document.createElement("button");
    outsideButton.textContent = "outside";
    document.body.appendChild(outsideButton);
    outsideButton.focus();
    expect(document.activeElement).toBe(outsideButton);

    const { unmount } = render(
      <DaySheet isoDate="2026-08-20" trip={null} trips={[]} homeTz="Asia/Dubai" onClose={vi.fn()} onChanged={vi.fn()} onAdded={vi.fn()} />,
    );

    expect(document.activeElement).toBe(screen.getByTestId("day-sheet"));

    unmount();
    expect(document.activeElement).toBe(outsideButton);
    outsideButton.remove();
  });

  it("add flow: happy path posts the same UTC payload as the original stepper, then fires confirmSchedule, and the sheet STAYS open in the rapid-entry 'added' state", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
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
      id: "trip-1",
      userId: "u1",
      label: null,
      createdAt: Date.now(),
      flights: [
        {
          id: "new-f1",
          tripId: "trip-1",
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
    const onChanged = vi.fn();
    const onClose = vi.fn();
    const onAdded = vi.fn();

    render(
      <DaySheet
        isoDate="2026-08-20"
        trip={null}
        trips={[]}
        homeTz="Asia/Dubai"
        onClose={onClose}
        onChanged={onChanged}
        onAdded={onAdded}
      />,
    );

    await user.type(screen.getByTestId("flightno-input"), "ek001");
    await vi.advanceTimersByTimeAsync(400);

    const card = await screen.findByTestId("autofill-card");
    expect(card).toHaveTextContent("DXB → LHR");

    await user.click(screen.getByRole("button", { name: /add to roster/i }));

    await waitFor(() => expect(createTrip).toHaveBeenCalled());
    const payload = vi.mocked(createTrip).mock.calls[0]?.[0];
    expect(payload!.legs[0]).toMatchObject({
      flightNo: "EK001",
      origin: "DXB",
      dest: "LHR",
      depUtc: "2026-08-20T05:15:00.000Z",
      arrUtc: "2026-08-20T12:35:00.000Z",
      reportUtc: "2026-08-20T03:45:00.000Z",
    });

    await waitFor(() => expect(confirmSchedule).toHaveBeenCalled());

    // Rapid-entry: sheet stays open, marks the day optimistically (no refetch), does NOT close.
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith("2026-08-20"));
    expect(onChanged).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    // Banner shows the added date and the next suggested date.
    const banner = await screen.findByTestId("rapid-banner");
    expect(banner).toHaveTextContent(/added/i);
    expect(banner).toHaveTextContent(/next/i);

    // Flight field cleared and refocused.
    const input = screen.getByTestId("flightno-input") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);

    // Fresh session (trips=[] - useRecentFlights alone would see nothing until the next
    // refetch): the just-added flight is still offered as a recent-flight chip immediately,
    // fed from this session's own adds rather than the (stale-until-Done) trips prop.
    expect(screen.getByTestId("recent-chip-EK001")).toBeInTheDocument();
  });

  it("rapid entry: recent-flight chips render from the trips fixture, and tapping one fills + immediately looks up", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
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

    render(
      <DaySheet
        isoDate="2026-08-20"
        trip={null}
        trips={[trip]}
        homeTz="Asia/Dubai"
        onClose={vi.fn()}
        onChanged={vi.fn()}
        onAdded={vi.fn()}
      />,
    );

    const chip = await screen.findByTestId("recent-chip-EK002");
    expect(chip).toHaveTextContent("EK002");

    await user.click(chip);

    const input = screen.getByTestId("flightno-input") as HTMLInputElement;
    expect(input.value).toBe("EK002");

    await vi.advanceTimersByTimeAsync(400);
    await waitFor(() => expect(lookupSchedule).toHaveBeenCalledWith("EK002", "2026-08-20"));
    expect(await screen.findByTestId("autofill-card")).toBeInTheDocument();
  });

  it("rapid entry: next-date suggestion skips days that already have a trip, including one just added this session", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
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
      id: "trip-2",
      userId: "u1",
      label: null,
      createdAt: Date.now(),
      flights: [],
    });

    // 2026-08-21 already has a trip (occupied fixture) - next suggestion after adding on
    // 2026-08-20 must skip past it to 2026-08-22.
    const occupiedTrip: TripWithFlights = {
      ...trip,
      id: "occupied",
      flights: [{ ...trip.flights[0]!, id: "occ-f1", depUtc: "2026-08-21T02:15:00.000Z", arrUtc: "2026-08-21T07:30:00.000Z" }],
    };

    render(
      <DaySheet
        isoDate="2026-08-20"
        trip={null}
        trips={[occupiedTrip]}
        homeTz="Asia/Dubai"
        onClose={vi.fn()}
        onChanged={vi.fn()}
        onAdded={vi.fn()}
      />,
    );

    await user.type(screen.getByTestId("flightno-input"), "ek001");
    await vi.advanceTimersByTimeAsync(400);
    await screen.findByTestId("autofill-card");
    await user.click(screen.getByRole("button", { name: /add to roster/i }));

    const banner = await screen.findByTestId("rapid-banner");
    expect(banner).toHaveTextContent("Sat 22 Aug");
  });

  it("rapid entry: next-date suggestion skips the FULL span of a pre-existing multi-day trip (not just its departure date)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
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
      id: "trip-2",
      userId: "u1",
      label: null,
      createdAt: Date.now(),
      flights: [],
    });

    // Existing trip's away-span (Asia/Dubai local) runs 2026-08-21 through 2026-08-23 -
    // three days, not just its departure date. isDayOccupied already used the full
    // first-leg-dep..last-leg-arr span (only `justAdded`, the just-added-this-session set,
    // had the single-date bug) - this locks in that existing-trip behavior stays correct.
    const multiDayTrip: TripWithFlights = {
      ...trip,
      id: "multi-day",
      flights: [
        { ...trip.flights[0]!, id: "md-f1", legSeq: 0, depUtc: "2026-08-21T02:15:00.000Z", arrUtc: "2026-08-21T07:30:00.000Z" },
        { ...trip.flights[0]!, id: "md-f2", legSeq: 1, depUtc: "2026-08-23T10:00:00.000Z", arrUtc: "2026-08-23T14:00:00.000Z" },
      ],
    };

    render(
      <DaySheet
        isoDate="2026-08-20"
        trip={null}
        trips={[multiDayTrip]}
        homeTz="Asia/Dubai"
        onClose={vi.fn()}
        onChanged={vi.fn()}
        onAdded={vi.fn()}
      />,
    );

    await user.type(screen.getByTestId("flightno-input"), "ek001");
    await vi.advanceTimersByTimeAsync(400);
    await screen.findByTestId("autofill-card");
    await user.click(screen.getByRole("button", { name: /add to roster/i }));

    // Must skip past the entire existing span (21st-23rd), landing on the 24th - not the
    // 21st (the trip's own dep date, which would be the bug if only dep were checked).
    const banner = await screen.findByTestId("rapid-banner");
    expect(banner).toHaveTextContent("Mon 24 Aug");
  });

  it("rapid entry: next-date suggestion skips the FULL span of a multi-day trip just added this session (EK412-shape, DXB->SYD->CHC)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(lookupSchedule).mockResolvedValue({
      legs: [
        {
          legSeq: 0,
          origin: "DXB",
          dest: "SYD",
          depLocal: "10:15",
          arrLocal: "06:00",
          dayOffset: 1,
          originTz: "Asia/Dubai",
          destTz: "Australia/Sydney",
          confirmCount: 3,
        },
        {
          legSeq: 1,
          origin: "SYD",
          dest: "CHC",
          depLocal: "08:00",
          arrLocal: "13:00",
          dayOffset: 0,
          originTz: "Australia/Sydney",
          destTz: "Pacific/Auckland",
          confirmCount: 3,
        },
      ],
    });
    // Picked date 2026-08-20 (Asia/Dubai); the saved trip's away-span in Asia/Dubai runs
    // 2026-08-20 (dep) through 2026-08-22 (arr) - three local calendar days.
    vi.mocked(createTrip).mockResolvedValue({
      id: "trip-ek412",
      userId: "u1",
      label: null,
      createdAt: Date.now(),
      flights: [
        {
          id: "ek412-f1",
          tripId: "trip-ek412",
          userId: "u1",
          flightNo: "EK412",
          origin: "DXB",
          dest: "SYD",
          depUtc: "2026-08-20T06:15:00.000Z",
          arrUtc: "2026-08-21T00:00:00.000Z",
          reportUtc: "2026-08-20T04:45:00.000Z",
          depTz: "Asia/Dubai",
          arrTz: "Australia/Sydney",
          source: "manual",
          notes: null,
          legSeq: 0,
        },
        {
          id: "ek412-f2",
          tripId: "trip-ek412",
          userId: "u1",
          flightNo: "EK412",
          origin: "SYD",
          dest: "CHC",
          depUtc: "2026-08-21T22:00:00.000Z",
          // 2026-08-22T10:00:00Z is 2026-08-22 14:00 in Asia/Dubai (UTC+4) - the trip's
          // away-span in the sheet's homeTz ends on the 22nd, not the 20th.
          arrUtc: "2026-08-22T10:00:00.000Z",
          reportUtc: "2026-08-21T20:30:00.000Z",
          depTz: "Australia/Sydney",
          arrTz: "Pacific/Auckland",
          source: "manual",
          notes: null,
          legSeq: 1,
        },
      ],
    });

    render(
      <DaySheet isoDate="2026-08-20" trip={null} trips={[]} homeTz="Asia/Dubai" onClose={vi.fn()} onChanged={vi.fn()} onAdded={vi.fn()} />,
    );

    await user.type(screen.getByTestId("flightno-input"), "ek412");
    await vi.advanceTimersByTimeAsync(400);
    await screen.findByTestId("autofill-card");
    await user.click(screen.getByRole("button", { name: /add to roster/i }));

    // "next:" must be the day AFTER the trip's span ends (2026-08-23), not 2026-08-21 or
    // 2026-08-22 - both of which fall inside the just-saved trip's own away-span.
    const banner = await screen.findByTestId("rapid-banner");
    expect(banner).toHaveTextContent("Sun 23 Aug");
  });

  it("rapid entry: tapping the next-date label shows a 7-day date strip to adjust", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
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
      id: "trip-1",
      userId: "u1",
      label: null,
      createdAt: Date.now(),
      flights: [],
    });

    render(
      <DaySheet isoDate="2026-08-20" trip={null} trips={[]} homeTz="Asia/Dubai" onClose={vi.fn()} onChanged={vi.fn()} onAdded={vi.fn()} />,
    );

    await user.type(screen.getByTestId("flightno-input"), "ek001");
    await vi.advanceTimersByTimeAsync(400);
    await screen.findByTestId("autofill-card");
    await user.click(screen.getByRole("button", { name: /add to roster/i }));

    const nextDateLabel = await screen.findByTestId("rapid-next-date");
    await user.click(nextDateLabel);

    const strip = await screen.findByTestId("rapid-date-strip");
    expect(strip).toBeInTheDocument();
    // 7 candidate date buttons.
    expect(strip.querySelectorAll("button")).toHaveLength(7);
  });

  it("rapid entry: 'Done for now' dismisses the sheet and triggers exactly one refetch", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
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
      id: "trip-1",
      userId: "u1",
      label: null,
      createdAt: Date.now(),
      flights: [],
    });
    const onChanged = vi.fn();
    const onClose = vi.fn();

    render(
      <DaySheet
        isoDate="2026-08-20"
        trip={null}
        trips={[]}
        homeTz="Asia/Dubai"
        onClose={onClose}
        onChanged={onChanged}
        onAdded={vi.fn()}
      />,
    );

    await user.type(screen.getByTestId("flightno-input"), "ek001");
    await vi.advanceTimersByTimeAsync(400);
    await screen.findByTestId("autofill-card");
    await user.click(screen.getByRole("button", { name: /add to roster/i }));
    await screen.findByTestId("rapid-banner");

    await user.click(screen.getByTestId("done-button"));

    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("existing-trip day shows the route summary, and supports edit and delete", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(patchFlight).mockResolvedValue({ ...trip.flights[0]!, depUtc: "2026-08-11T03:15:00.000Z" });
    vi.mocked(deleteTrip).mockResolvedValue(undefined);
    const onChanged = vi.fn();
    const onClose = vi.fn();

    render(
      <DaySheet
        isoDate="2026-08-11"
        trip={trip}
        trips={[trip]}
        homeTz="Asia/Dubai"
        onClose={onClose}
        onChanged={onChanged}
        onAdded={vi.fn()}
      />,
    );

    expect(screen.getByText(/DXB/)).toBeInTheDocument();
    expect(screen.getByText(/LHR/)).toBeInTheDocument();
    expect(screen.getByText("EK002")).toBeInTheDocument();

    // Edit.
    await user.click(screen.getByTestId("edit-leg"));
    const depInput = screen.getByLabelText(/departure/i) as HTMLInputElement;
    await user.clear(depInput);
    await user.type(depInput, "2026-08-11T07:15");
    await user.click(screen.getByTestId("save-leg"));

    await waitFor(() => expect(patchFlight).toHaveBeenCalledWith("f1", { depUtc: "2026-08-11T03:15:00.000Z" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());

    // Delete with confirm.
    await user.click(screen.getByTestId("delete-trip"));
    expect(screen.getByText(/can't be undone/i)).toBeInTheDocument();
    await user.click(screen.getByTestId("confirm-delete"));

    await waitFor(() => expect(deleteTrip).toHaveBeenCalledWith("trip-1"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("falls back to the manual multi-leg fields on an unknown flight (404)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(lookupSchedule).mockResolvedValue(null);

    render(
      <DaySheet isoDate="2026-08-20" trip={null} trips={[]} homeTz="Asia/Dubai" onClose={vi.fn()} onChanged={vi.fn()} onAdded={vi.fn()} />,
    );

    await user.type(screen.getByTestId("flightno-input"), "xx999");
    await vi.advanceTimersByTimeAsync(400);

    expect(await screen.findByText(/unknown flight/i)).toBeInTheDocument();
    await user.click(screen.getByTestId("manual-expand"));

    const depInput = screen.getByLabelText(/departure/i) as HTMLInputElement;
    expect(depInput.value).toBe("2026-08-20T00:00");
  });

  it("manual entry: after a successful save, joins the same rapid-entry chain as the autofill path (banner, cleared+refocused input, chips, Done)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(lookupSchedule).mockResolvedValue(null);
    vi.mocked(getAirport).mockImplementation(async (iata: string) => {
      if (iata === "DXB") return { iata: "DXB", city: "Dubai", name: "Dubai Intl", tz: "Asia/Dubai" };
      if (iata === "LHR") return { iata: "LHR", city: "London", name: "Heathrow", tz: "Europe/London" };
      return null;
    });
    vi.mocked(createTrip).mockResolvedValue({
      id: "trip-manual",
      userId: "u1",
      label: null,
      createdAt: Date.now(),
      flights: [],
    });

    render(
      <DaySheet
        isoDate="2026-08-20"
        trip={null}
        trips={[trip]}
        homeTz="Asia/Dubai"
        onClose={vi.fn()}
        onChanged={vi.fn()}
        onAdded={vi.fn()}
      />,
    );

    await user.type(screen.getByTestId("flightno-input"), "xx999");
    await vi.advanceTimersByTimeAsync(400);
    await screen.findByText(/unknown flight/i);
    await user.click(screen.getByTestId("manual-expand"));

    // Flight-no field is already prefilled ("XX999") by switchToManual - no need to type it.
    await user.type(screen.getByLabelText(/^origin$/i), "DXB");
    await user.tab();
    await user.type(screen.getByLabelText(/^dest$/i), "LHR");
    await user.tab();
    const depInput = screen.getByLabelText(/departure/i);
    await user.clear(depInput);
    await user.type(depInput, "2026-08-20T09:15");
    const arrInput = screen.getByLabelText(/arrival/i);
    await user.clear(arrInput);
    await user.type(arrInput, "2026-08-20T13:35");
    await user.click(screen.getByRole("button", { name: /add to roster/i }));

    await waitFor(() => expect(createTrip).toHaveBeenCalled());

    // Same rapid-entry "added" state as the autofill path: banner, cleared+refocused
    // flight-no input (back on the flightno-mode screen, not stuck on the manual form),
    // recent-flight chips, and the Done button.
    const banner = await screen.findByTestId("rapid-banner");
    expect(banner).toHaveTextContent(/added/i);
    expect(banner).toHaveTextContent(/next/i);

    const input = screen.getByTestId("flightno-input") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);

    expect(screen.getByTestId("recent-chip-EK002")).toBeInTheDocument();
    expect(screen.getByTestId("done-button")).toBeInTheDocument();
  });

  describe("turnaround chaining (+ add flight)", () => {
    // Same real seed rows as useTripEntry.test.ts's appendFlight suite (scripts/ek-schedules.json):
    // EK097 DXB->BCN dep 08:20 arr 12:35 (dayOffset 0); EK098 BCN->DXB dep 14:15 arr 00:05 (dayOffset 1).
    const EK097_LEGS = [
      {
        legSeq: 0,
        origin: "DXB",
        dest: "BCN",
        depLocal: "08:20",
        arrLocal: "12:35",
        dayOffset: 0,
        originTz: "Asia/Dubai",
        destTz: "Europe/Madrid",
        confirmCount: 2,
      },
    ];
    const EK098_LEGS = [
      {
        legSeq: 0,
        origin: "BCN",
        dest: "DXB",
        depLocal: "14:15",
        arrLocal: "00:05",
        dayOffset: 1,
        originTz: "Europe/Madrid",
        destTz: "Asia/Dubai",
        confirmCount: 2,
      },
    ];

    async function previewEk097(user: ReturnType<typeof userEvent.setup>) {
      vi.mocked(lookupSchedule).mockResolvedValueOnce({ legs: EK097_LEGS });
      render(
        <DaySheet
          isoDate="2026-08-20"
          trip={null}
          trips={[]}
          homeTz="Asia/Dubai"
          onClose={vi.fn()}
          onChanged={vi.fn()}
          onAdded={vi.fn()}
        />,
      );
      await user.type(screen.getByTestId("flightno-input"), "ek097");
      await vi.advanceTimersByTimeAsync(400);
      await screen.findByTestId("autofill-card");
    }

    it("shows '+ add flight' only in preview state, chains EK098 into one combined save, and lets ✕ revert it", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await previewEk097(user);

      expect(screen.getByTestId("append-flight")).toBeInTheDocument();

      await user.click(screen.getByTestId("append-flight"));
      const appendInput = screen.getByTestId("append-flightno-input");

      vi.mocked(lookupSchedule).mockResolvedValueOnce({ legs: EK098_LEGS });
      await user.type(appendInput, "ek098");
      await user.keyboard("{Enter}");

      const appendedCard = await screen.findByTestId("appended-card");
      expect(appendedCard).toHaveTextContent("BCN → DXB");
      // The "+ add flight" control is hidden once a flight is appended - the ✕ is the only
      // way back to single-flight state.
      expect(screen.queryByTestId("append-flight")).not.toBeInTheDocument();

      vi.mocked(createTrip).mockResolvedValue({
        id: "trip-1",
        userId: "u1",
        label: null,
        createdAt: Date.now(),
        flights: [],
      });

      await user.click(screen.getByRole("button", { name: /add to roster/i }));

      await waitFor(() => expect(createTrip).toHaveBeenCalledTimes(1));
      const payload = vi.mocked(createTrip).mock.calls[0]?.[0];
      // ONE trip, two legs, combined save (not two POSTs).
      expect(payload!.legs).toHaveLength(2);
      expect(payload!.legs[0]).toMatchObject({ flightNo: "EK097", origin: "DXB", dest: "BCN" });
      expect(payload!.legs[1]).toMatchObject({ flightNo: "EK098", origin: "BCN", dest: "DXB" });
    });

    it("reverts to single-flight preview when the appended card's ✕ is clicked", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await previewEk097(user);

      await user.click(screen.getByTestId("append-flight"));
      vi.mocked(lookupSchedule).mockResolvedValueOnce({ legs: EK098_LEGS });
      await user.type(screen.getByTestId("append-flightno-input"), "ek098");
      await user.keyboard("{Enter}");
      await screen.findByTestId("appended-card");

      await user.click(screen.getByTestId("remove-appended"));

      expect(screen.queryByTestId("appended-card")).not.toBeInTheDocument();
      expect(screen.getByTestId("autofill-card")).toHaveTextContent("DXB → BCN");
      expect(screen.getByTestId("autofill-card")).not.toHaveTextContent("BCN → DXB");
      // Back to single-flight preview: the "+ add flight" control is available again.
      expect(screen.getByTestId("append-flight")).toBeInTheDocument();
    });

    it("shows an inline muted error for an appended flight number with no schedule row, without falling back to manual mode", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await previewEk097(user);

      await user.click(screen.getByTestId("append-flight"));
      vi.mocked(lookupSchedule).mockResolvedValueOnce(null);
      await user.type(screen.getByTestId("append-flightno-input"), "xx999");
      await user.keyboard("{Enter}");

      expect(await screen.findByText(/unknown flight/i)).toBeInTheDocument();
      // No manual-entry form appeared - the outbound preview is untouched.
      expect(screen.getByTestId("autofill-card")).toBeInTheDocument();
      expect(screen.queryByTestId("manual-expand")).not.toBeInTheDocument();
    });
  });

  describe("return-suggestion chips", () => {
    // EK412 DXB->SYD->CHC - final leg lands at CHC, away from home base DXB, so a successful
    // add of this trip should trigger a return-suggestion fetch.
    const EK412_LEGS = [
      {
        legSeq: 0,
        origin: "DXB",
        dest: "SYD",
        depLocal: "10:15",
        arrLocal: "06:00",
        dayOffset: 1,
        originTz: "Asia/Dubai",
        destTz: "Australia/Sydney",
        confirmCount: 3,
      },
      {
        legSeq: 1,
        origin: "SYD",
        dest: "CHC",
        depLocal: "07:45",
        arrLocal: "12:55",
        dayOffset: 0,
        originTz: "Australia/Sydney",
        destTz: "Pacific/Auckland",
        confirmCount: 3,
      },
    ];
    const EK412_SAVED: TripWithFlights = {
      id: "trip-ek412",
      userId: "u1",
      label: null,
      createdAt: Date.now(),
      flights: [
        {
          id: "ek412-f1",
          tripId: "trip-ek412",
          userId: "u1",
          flightNo: "EK412",
          origin: "DXB",
          dest: "SYD",
          depUtc: "2026-08-20T06:15:00.000Z",
          arrUtc: "2026-08-21T00:00:00.000Z",
          reportUtc: "2026-08-20T04:45:00.000Z",
          depTz: "Asia/Dubai",
          arrTz: "Australia/Sydney",
          source: "manual",
          notes: null,
          legSeq: 0,
        },
        {
          id: "ek412-f2",
          tripId: "trip-ek412",
          userId: "u1",
          flightNo: "EK412",
          origin: "SYD",
          dest: "CHC",
          depUtc: "2026-08-21T22:00:00.000Z",
          arrUtc: "2026-08-22T00:55:00.000Z",
          reportUtc: "2026-08-21T20:30:00.000Z",
          depTz: "Australia/Sydney",
          arrTz: "Pacific/Auckland",
          source: "manual",
          notes: null,
          legSeq: 1,
        },
      ],
    };
    // EK002 DXB->LHR (see top-level `trip` fixture) - final leg lands at LHR, also away from
    // home base DXB, reused below for the "hidden on empty" and "hidden on error" cases so
    // those tests don't need their own multi-leg fixture.

    async function addEk412(user: ReturnType<typeof userEvent.setup>) {
      vi.mocked(lookupSchedule).mockResolvedValueOnce({ legs: EK412_LEGS });
      vi.mocked(createTrip).mockResolvedValueOnce(EK412_SAVED);
      render(
        <DaySheet
          isoDate="2026-08-20"
          trip={null}
          trips={[]}
          homeTz="Asia/Dubai"
          onClose={vi.fn()}
          onChanged={vi.fn()}
          onAdded={vi.fn()}
        />,
      );
      await user.type(screen.getByTestId("flightno-input"), "ek412");
      await vi.advanceTimersByTimeAsync(400);
      await screen.findByTestId("autofill-card");
      await user.click(screen.getByRole("button", { name: /add to roster/i }));
      await screen.findByTestId("rapid-banner");
    }

    it("fires suggestReturns with the saved trip's final dest as origin, next-day date, home DXB, outbound flightNo, and last-leg arrival", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await addEk412(user);

      await waitFor(() =>
        expect(suggestReturns).toHaveBeenCalledWith({
          origin: "CHC",
          date: "2026-08-23",
          home: "DXB",
          outbound: "EK412",
          arrivedIso: "2026-08-22T00:55:00.000Z",
        }),
      );
    });

    it("renders up to 3 return chips above the recent chips, in server order, with weekday+day+layover badge text", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      vi.mocked(suggestReturns).mockResolvedValue({
        suggestions: [
          {
            flightNo: "EK413",
            legs: [],
            layoverHours: 51,
            sibling: true,
            dateIso: "2026-08-23",
          },
          {
            flightNo: "EK415",
            legs: [],
            layoverHours: 3,
            sibling: false,
            dateIso: "2026-08-24",
          },
        ],
      });

      await addEk412(user);

      const ek413Chip = await screen.findByTestId("return-chip-EK413");
      // "↩ EK413 · Sun 23 Aug · 2d 3h" - weekday+day+month from the suggestion's resolved
      // dateIso (Asia/Dubai calendar), layover badge from formatHours(51) = "2d 3h".
      expect(ek413Chip).toHaveTextContent("EK413");
      expect(ek413Chip).toHaveTextContent("Sun 23 Aug");
      expect(ek413Chip).toHaveTextContent("2d 3h");

      const ek415Chip = await screen.findByTestId("return-chip-EK415");
      expect(ek415Chip).toHaveTextContent("3h");

      // Server order preserved (sibling-pinned EK413 first) - not re-sorted client-side.
      const chips = screen.getAllByTestId(/^return-chip-/);
      expect(chips[0]).toHaveAttribute("data-testid", "return-chip-EK413");
      expect(chips[1]).toHaveAttribute("data-testid", "return-chip-EK415");
    });

    it("caps rendered return chips at 3 even when the server returns more", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      vi.mocked(suggestReturns).mockResolvedValue({
        suggestions: [
          { flightNo: "EK413", legs: [], layoverHours: 2, sibling: true, dateIso: "2026-08-23" },
          { flightNo: "EK415", legs: [], layoverHours: 3, sibling: false, dateIso: "2026-08-23" },
          { flightNo: "EK417", legs: [], layoverHours: 4, sibling: false, dateIso: "2026-08-23" },
          { flightNo: "EK419", legs: [], layoverHours: 5, sibling: false, dateIso: "2026-08-24" },
        ],
      });

      await addEk412(user);

      await screen.findByTestId("return-chip-EK413");
      expect(screen.getAllByTestId(/^return-chip-/)).toHaveLength(3);
      expect(screen.queryByTestId("return-chip-EK419")).not.toBeInTheDocument();
    });

    it("tapping a return chip prefills add-mode with the suggestion's date and flight number, firing the existing lookup flow", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      vi.mocked(suggestReturns).mockResolvedValue({
        suggestions: [
          { flightNo: "EK413", legs: [], layoverHours: 2, sibling: true, dateIso: "2026-08-23" },
        ],
      });

      await addEk412(user);
      const chip = await screen.findByTestId("return-chip-EK413");

      vi.mocked(lookupSchedule).mockResolvedValueOnce({
        legs: [
          {
            legSeq: 0,
            origin: "CHC",
            dest: "DXB",
            depLocal: "14:00",
            arrLocal: "06:00",
            dayOffset: 1,
            originTz: "Pacific/Auckland",
            destTz: "Asia/Dubai",
            confirmCount: 3,
          },
        ],
      });

      await user.click(chip);

      const input = screen.getByTestId("flightno-input") as HTMLInputElement;
      expect(input.value).toBe("EK413");

      await vi.advanceTimersByTimeAsync(400);
      await waitFor(() => expect(lookupSchedule).toHaveBeenCalledWith("EK413", "2026-08-23"));
      expect(await screen.findByTestId("autofill-card")).toBeInTheDocument();
    });

    it("hides the return-chip section when suggestReturns resolves empty", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      vi.mocked(suggestReturns).mockResolvedValue({ suggestions: [] });

      await addEk412(user);
      await waitFor(() => expect(suggestReturns).toHaveBeenCalled());

      expect(screen.queryByTestId(/^return-chip-/)).not.toBeInTheDocument();
    });

    it("hides the return-chip section when suggestReturns rejects (fire-and-forget error)", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      vi.mocked(suggestReturns).mockRejectedValue(new Error("network error"));

      await addEk412(user);
      await waitFor(() => expect(suggestReturns).toHaveBeenCalled());

      expect(screen.queryByTestId(/^return-chip-/)).not.toBeInTheDocument();
    });

    it("does not fire suggestReturns when the saved trip's final leg already lands at home base DXB", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      vi.mocked(lookupSchedule).mockResolvedValueOnce({
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
          {
            legSeq: 1,
            origin: "LHR",
            dest: "DXB",
            depLocal: "20:00",
            arrLocal: "06:00",
            dayOffset: 1,
            originTz: "Europe/London",
            destTz: "Asia/Dubai",
            confirmCount: 3,
          },
        ],
      });
      vi.mocked(createTrip).mockResolvedValueOnce({
        id: "trip-roundtrip",
        userId: "u1",
        label: null,
        createdAt: Date.now(),
        flights: [
          {
            id: "rt-f1",
            tripId: "trip-roundtrip",
            userId: "u1",
            flightNo: "EK005",
            origin: "DXB",
            dest: "LHR",
            depUtc: "2026-08-20T05:15:00.000Z",
            arrUtc: "2026-08-20T09:35:00.000Z",
            reportUtc: "2026-08-20T03:45:00.000Z",
            depTz: "Asia/Dubai",
            arrTz: "Europe/London",
            source: "manual",
            notes: null,
            legSeq: 0,
          },
          {
            id: "rt-f2",
            tripId: "trip-roundtrip",
            userId: "u1",
            flightNo: "EK005",
            origin: "LHR",
            dest: "DXB",
            depUtc: "2026-08-20T16:00:00.000Z",
            arrUtc: "2026-08-21T02:00:00.000Z",
            reportUtc: "2026-08-20T14:30:00.000Z",
            depTz: "Europe/London",
            arrTz: "Asia/Dubai",
            source: "manual",
            notes: null,
            legSeq: 1,
          },
        ],
      });

      render(
        <DaySheet isoDate="2026-08-20" trip={null} trips={[]} homeTz="Asia/Dubai" onClose={vi.fn()} onChanged={vi.fn()} onAdded={vi.fn()} />,
      );
      await user.type(screen.getByTestId("flightno-input"), "ek005");
      await vi.advanceTimersByTimeAsync(400);
      await screen.findByTestId("autofill-card");
      await user.click(screen.getByRole("button", { name: /add to roster/i }));
      await screen.findByTestId("rapid-banner");

      expect(suggestReturns).not.toHaveBeenCalled();
      expect(screen.queryByTestId(/^return-chip-/)).not.toBeInTheDocument();
    });
  });
});

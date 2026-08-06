import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DaySheet, { humanDateLabel } from "./DaySheet";
import { confirmSchedule, createTrip, deleteTrip, getAirport, lookupSchedule, patchFlight } from "./api";
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
});

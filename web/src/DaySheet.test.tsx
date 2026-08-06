import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DaySheet from "./DaySheet";
import { confirmSchedule, createTrip, deleteTrip, getAirport, lookupSchedule, patchFlight } from "./api";
import type { TripWithFlights } from "./api";

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
      flights: [],
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
    expect(banner).toHaveTextContent("2026-08-22");
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
});

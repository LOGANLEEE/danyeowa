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
    render(<DaySheet isoDate="2026-08-20" trip={null} homeTz="Asia/Dubai" onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByTestId("day-sheet")).toBeInTheDocument();
    expect(screen.getByText(/add trip/i)).toBeInTheDocument();
  });

  it("dismisses when the scrim is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onClose = vi.fn();
    render(<DaySheet isoDate="2026-08-20" trip={null} homeTz="Asia/Dubai" onClose={onClose} onChanged={vi.fn()} />);

    await user.click(screen.getByTestId("sheet-scrim"));
    expect(onClose).toHaveBeenCalled();
  });

  it("dismisses when the close button is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onClose = vi.fn();
    render(<DaySheet isoDate="2026-08-20" trip={null} homeTz="Asia/Dubai" onClose={onClose} onChanged={vi.fn()} />);

    await user.click(screen.getByTestId("sheet-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("dismisses on Escape", () => {
    const onClose = vi.fn();
    render(<DaySheet isoDate="2026-08-20" trip={null} homeTz="Asia/Dubai" onClose={onClose} onChanged={vi.fn()} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("moves focus into the sheet on open and restores it on close", () => {
    const outsideButton = document.createElement("button");
    outsideButton.textContent = "outside";
    document.body.appendChild(outsideButton);
    outsideButton.focus();
    expect(document.activeElement).toBe(outsideButton);

    const { unmount } = render(
      <DaySheet isoDate="2026-08-20" trip={null} homeTz="Asia/Dubai" onClose={vi.fn()} onChanged={vi.fn()} />,
    );

    expect(document.activeElement).toBe(screen.getByTestId("day-sheet"));

    unmount();
    expect(document.activeElement).toBe(outsideButton);
    outsideButton.remove();
  });

  it("add flow: happy path posts the same UTC payload as the original stepper, then fires confirmSchedule", async () => {
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
      <DaySheet isoDate="2026-08-20" trip={null} homeTz="Asia/Dubai" onClose={onClose} onChanged={onChanged} />,
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
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it("existing-trip day shows the route summary, and supports edit and delete", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(patchFlight).mockResolvedValue({ ...trip.flights[0]!, depUtc: "2026-08-11T03:15:00.000Z" });
    vi.mocked(deleteTrip).mockResolvedValue(undefined);
    const onChanged = vi.fn();
    const onClose = vi.fn();

    render(
      <DaySheet isoDate="2026-08-11" trip={trip} homeTz="Asia/Dubai" onClose={onClose} onChanged={onChanged} />,
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

    render(<DaySheet isoDate="2026-08-20" trip={null} homeTz="Asia/Dubai" onClose={vi.fn()} onChanged={vi.fn()} />);

    await user.type(screen.getByTestId("flightno-input"), "xx999");
    await vi.advanceTimersByTimeAsync(400);

    expect(await screen.findByText(/unknown flight/i)).toBeInTheDocument();
    await user.click(screen.getByTestId("manual-expand"));

    const depInput = screen.getByLabelText(/departure/i) as HTMLInputElement;
    expect(depInput.value).toBe("2026-08-20T00:00");
  });
});

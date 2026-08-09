import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TripDetail from "./TripDetail";
import { deleteTrip, patchFlight } from "./api";
import type { TripWithFlights } from "./api";

vi.mock("./api", () => ({
  deleteTrip: vi.fn(),
  patchFlight: vi.fn(),
}));

// DXB -> LHR single-leg trip fixture.
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

describe("TripDetail", () => {
  beforeEach(() => {
    vi.mocked(deleteTrip).mockReset();
    vi.mocked(patchFlight).mockReset();
  });

  it("renders each leg's route and local times", () => {
    const { container } = render(<TripDetail trip={trip} onDone={vi.fn()} onBack={vi.fn()} />);

    expect(screen.getByText(/DXB/)).toBeInTheDocument();
    expect(screen.getByText(/LHR/)).toBeInTheDocument();
    expect(screen.getByText("EK002")).toBeInTheDocument();
    // Report time local to DXB (Asia/Dubai, UTC+4): 00:45 UTC -> 04:45.
    expect(container.textContent).toContain("04:45");
  });

  it("edit -> change departure -> save calls patchFlight with only the UTC-converted changed field", async () => {
    const user = userEvent.setup();
    vi.mocked(patchFlight).mockResolvedValue(trip.flights[0]!);

    render(<TripDetail trip={trip} onDone={vi.fn()} onBack={vi.fn()} />);

    await user.click(screen.getByTestId("edit-leg"));

    // No report input in the edit form (Plan 10 Task 3: report removed from all entry/edit
    // forms, still displayed read-only in the summary line — see the test above).
    expect(screen.queryByLabelText(/report/i)).not.toBeInTheDocument();

    const depInput = screen.getByLabelText(/departure/i) as HTMLInputElement;
    await user.clear(depInput);
    // Original dep was 2026-08-11T06:15 local Dubai (UTC+4). Bump 1 hour to 07:15.
    await user.type(depInput, "2026-08-11T07:15");

    await user.click(screen.getByTestId("save-leg"));

    expect(patchFlight).toHaveBeenCalledTimes(1);
    const [id, patch] = vi.mocked(patchFlight).mock.calls[0]!;
    expect(id).toBe("f1");
    expect(Object.keys(patch)).toEqual(["depUtc"]);
    expect(patch.depUtc).toBe("2026-08-11T03:15:00.000Z");
  });

  it("cancel discards edits without calling patchFlight", async () => {
    const user = userEvent.setup();
    render(<TripDetail trip={trip} onDone={vi.fn()} onBack={vi.fn()} />);

    await user.click(screen.getByTestId("edit-leg"));
    const depInput = screen.getByLabelText(/departure/i) as HTMLInputElement;
    await user.clear(depInput);
    await user.type(depInput, "2026-08-11T09:00");

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(patchFlight).not.toHaveBeenCalled();
    // Back to display mode showing the original time.
    expect(screen.getByText("EK002")).toBeInTheDocument();
    expect(screen.queryByLabelText(/departure/i)).not.toBeInTheDocument();
  });

  it("delete -> confirm calls deleteTrip then onDone", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteTrip).mockResolvedValue(undefined);
    const onDone = vi.fn();

    render(<TripDetail trip={trip} onDone={onDone} onBack={vi.fn()} />);

    await user.click(screen.getByTestId("delete-trip"));
    expect(screen.getByText(/can't be undone/i)).toBeInTheDocument();

    await user.click(screen.getByTestId("confirm-delete"));

    expect(deleteTrip).toHaveBeenCalledWith("trip-1");
    expect(onDone).toHaveBeenCalled();
  });

  it("delete -> cancel confirm dismisses without calling deleteTrip", async () => {
    const user = userEvent.setup();
    render(<TripDetail trip={trip} onDone={vi.fn()} onBack={vi.fn()} />);

    await user.click(screen.getByTestId("delete-trip"));
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(deleteTrip).not.toHaveBeenCalled();
    expect(screen.queryByText(/can't be undone/i)).not.toBeInTheDocument();
  });
});

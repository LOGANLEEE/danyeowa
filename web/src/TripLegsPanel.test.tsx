import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TripLegsPanel from "./TripLegsPanel";
import { deleteTrip } from "./api";
import type { TripWithFlights } from "./api";

vi.mock("./api", () => ({
  deleteTrip: vi.fn(),
}));

// Legs deliberately out of legSeq order in the array - the panel sorts by legSeq itself.
const trip: TripWithFlights = {
  id: "trip-1",
  userId: "u1",
  label: null,
  createdAt: Date.now(),
  flights: [
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
  ],
};

describe("TripLegsPanel", () => {
  beforeEach(() => {
    vi.mocked(deleteTrip).mockReset();
  });

  it("renders every leg read-only, sorted by legSeq (not array order)", () => {
    render(<TripLegsPanel trip={trip} onChanged={vi.fn()} />);

    const panel = screen.getByTestId("trip-legs-panel");
    expect(panel).toHaveTextContent("DXB");
    expect(panel).toHaveTextContent("SIN");
    expect(panel).toHaveTextContent("AKL");
    expect(panel).toHaveTextContent("EK448");
    expect(panel).toHaveTextContent("EK449");

    // legSeq 0 (DXB → SIN) must render before legSeq 1 (SIN → AKL) despite the reversed
    // fixture array order.
    const text = panel.textContent!;
    const firstLegIndex = text.indexOf("DXB → SIN");
    const secondLegIndex = text.indexOf("SIN → AKL");
    expect(firstLegIndex).toBeGreaterThanOrEqual(0);
    expect(secondLegIndex).toBeGreaterThan(firstLegIndex);

    // Times come from the schedule provider - no editable fields anywhere in the panel.
    expect(panel.querySelectorAll("input").length).toBe(0);
  });

  it("delete-trip -> confirm-delete calls deleteTrip then onChanged", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteTrip).mockResolvedValue(undefined);
    const onChanged = vi.fn();

    render(<TripLegsPanel trip={trip} onChanged={onChanged} />);

    // The trigger is an icon-only button, reachable only by its label.
    await user.click(screen.getByRole("button", { name: /delete trip/i }));
    expect(screen.getByText(/can't be undone/i)).toBeInTheDocument();

    await user.click(screen.getByTestId("confirm-delete"));

    await waitFor(() => expect(deleteTrip).toHaveBeenCalledWith("trip-1"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("a delete failure surfaces the error and keeps the panel (and confirm step) open", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteTrip).mockRejectedValue(new Error("network error"));
    const onChanged = vi.fn();

    render(<TripLegsPanel trip={trip} onChanged={onChanged} />);

    await user.click(screen.getByRole("button", { name: /delete trip/i }));
    await user.click(screen.getByTestId("confirm-delete"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/network error/i);
    expect(onChanged).not.toHaveBeenCalled();

    // Stays in the confirm state (not dismissed) so the crew can retry.
    expect(screen.getByTestId("trip-legs-panel")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-delete")).toBeInTheDocument();
  });
});

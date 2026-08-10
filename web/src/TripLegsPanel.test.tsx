import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TripLegsPanel from "./TripLegsPanel";
import type { TripWithFlights } from "./api";

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
  it("renders every leg read-only, sorted by legSeq (not array order)", () => {
    render(<TripLegsPanel trip={trip} />);

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
});

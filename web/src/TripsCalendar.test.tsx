import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TripsCalendar from "./TripsCalendar";
import type { TripWithFlights } from "./api";

const now = new Date("2026-08-10T12:00:00.000Z"); // Aug 10, mid-month, Asia/Dubai local = Aug 10 16:00

const trip: TripWithFlights = {
  id: "trip-1",
  userId: "u1",
  label: null,
  createdAt: now.getTime(),
  flights: [
    {
      id: "f1",
      tripId: "trip-1",
      userId: "u1",
      flightNo: "EK001",
      origin: "DXB",
      dest: "LHR",
      depUtc: "2026-08-15T05:00:00.000Z", // Aug 15 09:00 Dubai local
      arrUtc: "2026-08-15T10:00:00.000Z", // same local day
      reportUtc: "2026-08-15T03:30:00.000Z",
      depTz: "Asia/Dubai",
      arrTz: "Europe/London",
      source: "manual",
      notes: null,
      legSeq: 0,
    },
  ],
};

describe("TripsCalendar", () => {
  it("renders a weekday header row and the days of the current month", () => {
    render(
      <TripsCalendar now={now} trips={[]} homeTz="Asia/Dubai" onPickDay={vi.fn()} onOpenTrip={vi.fn()} />,
    );

    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Sun")).toBeInTheDocument();
    expect(screen.getByTestId("calendar-day-2026-08-10")).toBeInTheDocument();
  });

  it("marks the trip's day with an away marker", () => {
    render(
      <TripsCalendar
        now={now}
        trips={[trip]}
        homeTz="Asia/Dubai"
        onPickDay={vi.fn()}
        onOpenTrip={vi.fn()}
      />,
    );

    const day = screen.getByTestId("calendar-day-2026-08-15");
    expect(day.querySelector(".bg-away")).toBeTruthy();
  });

  it("calls onOpenTrip when tapping a day covered by a trip", async () => {
    const user = userEvent.setup();
    const onOpenTrip = vi.fn();
    render(
      <TripsCalendar
        now={now}
        trips={[trip]}
        homeTz="Asia/Dubai"
        onPickDay={vi.fn()}
        onOpenTrip={onOpenTrip}
      />,
    );

    await user.click(screen.getByTestId("calendar-day-2026-08-15"));
    expect(onOpenTrip).toHaveBeenCalledWith(trip);
  });

  it("calls onPickDay when tapping a future day with no trip", async () => {
    const user = userEvent.setup();
    const onPickDay = vi.fn();
    render(
      <TripsCalendar
        now={now}
        trips={[]}
        homeTz="Asia/Dubai"
        onPickDay={onPickDay}
        onOpenTrip={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("calendar-day-2026-08-20"));
    expect(onPickDay).toHaveBeenCalledWith("2026-08-20");
  });

  it("calls onPickDay when tapping today", async () => {
    const user = userEvent.setup();
    const onPickDay = vi.fn();
    render(
      <TripsCalendar
        now={now}
        trips={[]}
        homeTz="Asia/Dubai"
        onPickDay={onPickDay}
        onOpenTrip={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("calendar-day-2026-08-10"));
    expect(onPickDay).toHaveBeenCalledWith("2026-08-10");
  });

  it("does not call onPickDay when tapping a past day with no trip", async () => {
    const user = userEvent.setup();
    const onPickDay = vi.fn();
    render(
      <TripsCalendar
        now={now}
        trips={[]}
        homeTz="Asia/Dubai"
        onPickDay={onPickDay}
        onOpenTrip={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("calendar-day-2026-08-01"));
    expect(onPickDay).not.toHaveBeenCalled();
  });

  it("navigates to the next and previous month via chevrons", async () => {
    const user = userEvent.setup();
    render(
      <TripsCalendar now={now} trips={[]} homeTz="Asia/Dubai" onPickDay={vi.fn()} onOpenTrip={vi.fn()} />,
    );

    expect(screen.getByText(/august 2026/i)).toBeInTheDocument();

    await user.click(screen.getByTestId("calendar-next"));
    expect(screen.getByText(/september 2026/i)).toBeInTheDocument();

    await user.click(screen.getByTestId("calendar-prev"));
    await user.click(screen.getByTestId("calendar-prev"));
    expect(screen.getByText(/july 2026/i)).toBeInTheDocument();
  });

  it("marks today's cell distinctly from other cells", () => {
    render(
      <TripsCalendar now={now} trips={[]} homeTz="Asia/Dubai" onPickDay={vi.fn()} onOpenTrip={vi.fn()} />,
    );

    const today = screen.getByTestId("calendar-day-2026-08-10");
    expect(today.className).toContain("border-amber");
  });

  it("puts today's ring on the home-base LOCAL date, not the UTC date, when tz is ahead of UTC", () => {
    // 2026-08-10T21:00:00Z in Pacific/Auckland (+12 NZ winter) is local Aug 11 09:00 -
    // the today ring must land on Aug 11, not the UTC calendar date Aug 10.
    const nowAheadOfUtc = new Date("2026-08-10T21:00:00.000Z");
    render(
      <TripsCalendar
        now={nowAheadOfUtc}
        trips={[]}
        homeTz="Pacific/Auckland"
        onPickDay={vi.fn()}
        onOpenTrip={vi.fn()}
      />,
    );

    expect(screen.getByTestId("calendar-day-2026-08-11").className).toContain("border-amber");
    expect(screen.getByTestId("calendar-day-2026-08-10").className).not.toContain("border-amber");
  });

  it("puts today's ring on the home-base LOCAL date, not the UTC date, when tz is behind UTC", () => {
    // 2026-08-10T02:00:00Z in America/Sao_Paulo (-3) is local Aug 9 23:00 - the today ring
    // must land on Aug 9, not the UTC calendar date Aug 10.
    const nowBehindUtc = new Date("2026-08-10T02:00:00.000Z");
    render(
      <TripsCalendar
        now={nowBehindUtc}
        trips={[]}
        homeTz="America/Sao_Paulo"
        onPickDay={vi.fn()}
        onOpenTrip={vi.fn()}
      />,
    );

    expect(screen.getByTestId("calendar-day-2026-08-09").className).toContain("border-amber");
    expect(screen.getByTestId("calendar-day-2026-08-10").className).not.toContain("border-amber");
  });
});

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
      <TripsCalendar now={now} trips={[]} homeTz="Asia/Dubai" onPickDay={vi.fn()} />,
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
      />,
    );

    const day = screen.getByTestId("calendar-day-2026-08-15");
    expect(day.className).toContain("bg-accent-soft");
    expect(screen.getByTestId("day-mark-2026-08-15")).toBeInTheDocument();
  });

  it("shows direction and station on the grid without opening the day", () => {
    // DXB -> AKL out on Aug 15, slip Aug 16-17, AKL -> DXB home on Aug 18.
    const pairing: TripWithFlights = {
      ...trip,
      id: "trip-2",
      flights: [
        {
          ...trip.flights[0]!,
          id: "f-out",
          dest: "AKL",
          depUtc: "2026-08-15T05:00:00.000Z",
          arrUtc: "2026-08-16T02:00:00.000Z",
          arrTz: "Pacific/Auckland",
        },
        {
          ...trip.flights[0]!,
          id: "f-home",
          origin: "AKL",
          dest: "DXB",
          depUtc: "2026-08-18T05:00:00.000Z",
          arrUtc: "2026-08-18T18:00:00.000Z",
          depTz: "Pacific/Auckland",
          legSeq: 1,
        },
      ],
    };

    render(
      <TripsCalendar now={now} trips={[pairing]} homeTz="Asia/Dubai" onPickDay={vi.fn()} />,
    );

    expect(screen.getByTestId("day-mark-2026-08-15")).toHaveTextContent("↗AKL");
    expect(screen.getByTestId("day-mark-2026-08-16")).toHaveTextContent("·AKL");
    expect(screen.getByTestId("day-mark-2026-08-18")).toHaveTextContent("↙AKL");
  });

  it("shows a turnaround glyph for an out-and-back day", () => {
    const turnaround: TripWithFlights = {
      ...trip,
      id: "trip-3",
      flights: [
        {
          ...trip.flights[0]!,
          id: "f-out",
          dest: "BKK",
          depUtc: "2026-08-18T05:40:00.000Z",
          arrUtc: "2026-08-18T11:25:00.000Z",
        },
        {
          ...trip.flights[0]!,
          id: "f-back",
          origin: "BKK",
          dest: "DXB",
          depUtc: "2026-08-18T13:00:00.000Z",
          arrUtc: "2026-08-18T17:00:00.000Z",
          legSeq: 1,
        },
      ],
    };

    render(
      <TripsCalendar now={now} trips={[turnaround]} homeTz="Asia/Dubai" onPickDay={vi.fn()} />,
    );

    expect(screen.getByTestId("day-mark-2026-08-18")).toHaveTextContent("⇄BKK");
  });

  it("calls onPickDay when tapping a day covered by a trip", async () => {
    const user = userEvent.setup();
    const onPickDay = vi.fn();
    render(
      <TripsCalendar
        now={now}
        trips={[trip]}
        homeTz="Asia/Dubai"
        onPickDay={onPickDay}
      />,
    );

    await user.click(screen.getByTestId("calendar-day-2026-08-15"));
    expect(onPickDay).toHaveBeenCalledWith("2026-08-15");
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
      />,
    );

    await user.click(screen.getByTestId("calendar-day-2026-08-01"));
    expect(onPickDay).not.toHaveBeenCalled();
  });

  it("navigates to the next and previous month via chevrons", async () => {
    const user = userEvent.setup();
    render(
      <TripsCalendar now={now} trips={[]} homeTz="Asia/Dubai" onPickDay={vi.fn()} />,
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
      <TripsCalendar now={now} trips={[]} homeTz="Asia/Dubai" onPickDay={vi.fn()} />,
    );

    const today = screen.getByTestId("calendar-day-2026-08-10");
    expect(today.className).toContain("ring-accent");
  });

  it("marks a selected day with a stronger ring, distinct from today's plain ring, when they differ", () => {
    render(
      <TripsCalendar
        now={now}
        trips={[]}
        homeTz="Asia/Dubai"
        onPickDay={vi.fn()}
        selectedIso="2026-08-20"
      />,
    );

    const selected = screen.getByTestId("calendar-day-2026-08-20");
    const today = screen.getByTestId("calendar-day-2026-08-10");
    expect(selected.className).toContain("ring-accent");
    expect(selected.className).toContain("ring-offset");
    expect(today.className).toContain("ring-accent");
    expect(today.className).not.toContain("ring-offset");
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
      />,
    );

    expect(screen.getByTestId("calendar-day-2026-08-11").className).toContain("ring-accent");
    expect(screen.getByTestId("calendar-day-2026-08-10").className).not.toContain("ring-accent");
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
      />,
    );

    expect(screen.getByTestId("calendar-day-2026-08-09").className).toContain("ring-accent");
    expect(screen.getByTestId("calendar-day-2026-08-10").className).not.toContain("ring-accent");
  });
});

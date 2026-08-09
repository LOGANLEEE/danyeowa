import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TripForm from "./TripForm";
import { confirmSchedule, createTrip, getAirport, lookupSchedule } from "./api";

vi.mock("./api", () => ({
  createTrip: vi.fn(),
  getAirport: vi.fn(),
  lookupSchedule: vi.fn(),
  confirmSchedule: vi.fn(),
}));

const DXB = { iata: "DXB", city: "Dubai", name: "Dubai Intl", tz: "Asia/Dubai" };
const LHR = { iata: "LHR", city: "London", name: "Heathrow", tz: "Europe/London" };
const SYD = { iata: "SYD", city: "Sydney", name: "Sydney Kingsford Smith", tz: "Australia/Sydney" };

const NOW = new Date("2026-08-05T12:00:00.000Z");

function baseProps(overrides: Partial<React.ComponentProps<typeof TripForm>> = {}) {
  return {
    onSubmitted: vi.fn(),
    now: NOW,
    homeTz: "Asia/Dubai",
    ...overrides,
  };
}

describe("TripForm", () => {
  beforeEach(() => {
    vi.mocked(createTrip).mockReset();
    vi.mocked(getAirport).mockReset();
    vi.mocked(lookupSchedule).mockReset();
    vi.mocked(confirmSchedule).mockReset();
    vi.mocked(confirmSchedule).mockResolvedValue(undefined);
    vi.mocked(getAirport).mockImplementation(async (iata: string) => {
      if (iata === "DXB") return DXB;
      if (iata === "LHR") return LHR;
      if (iata === "SYD") return SYD;
      return null;
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the calendar picker first when no initialDate is given, then the flight-no step after a day is picked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TripForm {...baseProps()} />);

    // Step 1: calendar picker (reused TripsCalendar in picker mode).
    expect(screen.getByText(/when's the trip/i)).toBeInTheDocument();
    const dayCell = screen.getByTestId("calendar-day-2026-08-20");
    await user.click(dayCell);

    // Step 2: flight-no input, autofocused.
    const flightInput = await screen.findByTestId("flightno-input");
    expect(flightInput).toHaveFocus();
  });

  it("skips the calendar step when initialDate is provided (tapping a day on the main calendar)", () => {
    render(<TripForm {...baseProps({ initialDate: "2026-08-20" })} />);
    expect(screen.getByTestId("flightno-input")).toBeInTheDocument();
    expect(screen.queryByText(/when's the trip/i)).not.toBeInTheDocument();
  });

  it("autofills a single-leg flight from the schedule lookup and posts the correct UTC payload, then fires confirmSchedule with the saved times", async () => {
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
    const onSubmitted = vi.fn();

    render(<TripForm {...baseProps({ initialDate: "2026-08-20", onSubmitted })} />);

    await user.type(screen.getByTestId("flightno-input"), "ek001");
    await vi.advanceTimersByTimeAsync(400);

    const card = await screen.findByTestId("autofill-card");
    expect(card).toHaveTextContent("DXB → LHR");
    expect(screen.getAllByTestId("autofill-dep")[0]).toHaveValue("09:15");
    expect(screen.getAllByTestId("autofill-arr")[0]).toHaveValue("13:35");
    // No report chip/input anywhere in the autofill card (flight-code-only entry).
    expect(screen.queryByTestId("report-chip")).not.toBeInTheDocument();
    expect(screen.queryByText(/report/i)).not.toBeInTheDocument();

    // Edit the autofilled dep time before saving - the saved/confirmed values must
    // reflect this edit, not just echo the schedule lookup's original prefill.
    const depInput = screen.getAllByTestId("autofill-dep")[0]!;
    fireEvent.change(depInput, { target: { value: "09:45" } });
    expect(depInput).toHaveValue("09:45");

    await user.click(screen.getByRole("button", { name: /^add trip$/i }));

    await waitFor(() => expect(createTrip).toHaveBeenCalled());
    const payload = vi.mocked(createTrip).mock.calls[0]?.[0];
    expect(payload!.legs[0]).toMatchObject({
      flightNo: "EK001",
      origin: "DXB",
      dest: "LHR",
      depUtc: "2026-08-20T05:45:00.000Z",
      arrUtc: "2026-08-20T12:35:00.000Z",
    });
    // reportUtc is never included in the saved payload — the server derives it (dep - 90min)
    // from depUtc when absent (Plan 10 Task 3: report removed from all entry forms).
    expect(payload!.legs[0]).not.toHaveProperty("reportUtc");

    await waitFor(() => expect(confirmSchedule).toHaveBeenCalled());
    expect(confirmSchedule).toHaveBeenCalledWith({
      flightNo: "EK001",
      legSeq: 0,
      origin: "DXB",
      dest: "LHR",
      depLocal: "09:45",
      arrLocal: "13:35",
      dayOffset: 0,
    });
    expect(onSubmitted).toHaveBeenCalled();
  });

  it("derives the second leg's departure date from the first leg's arrival day offset (EK412 DXB->SYD->CHC style)", async () => {
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
          confirmCount: 1,
        },
        {
          legSeq: 1,
          origin: "SYD",
          dest: "LHR",
          depLocal: "07:45",
          arrLocal: "20:00",
          dayOffset: 0,
          originTz: "Australia/Sydney",
          destTz: "Europe/London",
          confirmCount: 1,
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

    render(<TripForm {...baseProps({ initialDate: "2026-08-20" })} />);

    await user.type(screen.getByTestId("flightno-input"), "ek412");
    await vi.advanceTimersByTimeAsync(400);
    await screen.findByTestId("autofill-card");

    await user.click(screen.getByRole("button", { name: /^add trip$/i }));
    await waitFor(() => expect(createTrip).toHaveBeenCalled());

    const payload = vi.mocked(createTrip).mock.calls[0]?.[0];
    // Leg 0 departs the picked date (2026-08-20 10:15 Asia/Dubai, +4 -> 06:15Z). Leg 1
    // departs on leg 0's arrival day (2026-08-21, since leg 0's dayOffset is 1) at 07:45
    // Australia/Sydney (+10 in August, no DST -> 2026-08-20T21:45Z).
    expect(payload!.legs[0]!.depUtc).toBe("2026-08-20T06:15:00.000Z");
    expect(payload!.legs[1]!.depUtc).toBe("2026-08-20T21:45:00.000Z");
  });

  it("shows a muted 'checking schedule…' line and disables Add while the lookup is in flight, then clears once the autofill card appears", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let resolveLookup!: (value: Awaited<ReturnType<typeof lookupSchedule>>) => void;
    vi.mocked(lookupSchedule).mockReturnValue(
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
    );

    render(<TripForm {...baseProps({ initialDate: "2026-08-20" })} />);
    expect(screen.queryByTestId("schedule-loading")).not.toBeInTheDocument();

    await user.type(screen.getByTestId("flightno-input"), "ek001");
    await vi.advanceTimersByTimeAsync(400);

    expect(await screen.findByTestId("schedule-loading")).toHaveTextContent(/checking schedule/i);
    expect(screen.queryByTestId("manual-expand")).not.toBeInTheDocument();

    await waitFor(() =>
      resolveLookup({
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
      }),
    );

    await screen.findByTestId("autofill-card");
    expect(screen.queryByTestId("schedule-loading")).not.toBeInTheDocument();
  });

  it("falls back to the manual multi-leg fields on an unknown flight (404)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(lookupSchedule).mockResolvedValue(null);

    render(<TripForm {...baseProps({ initialDate: "2026-08-20" })} />);
    await user.type(screen.getByTestId("flightno-input"), "xx999");
    await vi.advanceTimersByTimeAsync(400);

    expect(await screen.findByText(/unknown flight/i)).toBeInTheDocument();
    await user.click(screen.getByTestId("manual-expand"));

    // Manual fields appear, prefilled with the picked date and flight no.
    const depInput = screen.getByLabelText(/departure/i) as HTMLInputElement;
    expect(depInput.value).toBe("2026-08-20T00:00");
    expect((screen.getByLabelText(/flight no/i) as HTMLInputElement).value).toBe("XX999");
  });

  it("lets the user reach the manual path directly via the muted link, without a lookup miss", () => {
    render(<TripForm {...baseProps({ initialDate: "2026-08-20" })} />);
    expect(screen.getByTestId("manual-expand")).toBeInTheDocument();
  });

  it("manual path: fills one leg, converts wall times to UTC via the airport tz, and submits", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(createTrip).mockResolvedValue({
      id: "trip-1",
      userId: "u1",
      label: null,
      createdAt: Date.now(),
      flights: [],
    });
    const onSubmitted = vi.fn();

    render(<TripForm {...baseProps({ initialDate: "2026-08-20", onSubmitted })} />);
    await user.click(screen.getByTestId("manual-expand"));

    await user.clear(screen.getByLabelText(/flight no/i));
    await user.type(screen.getByLabelText(/flight no/i), "ek002");
    await user.type(screen.getByLabelText(/^origin/i), "dxb");
    await user.tab();
    expect(await screen.findByText(/dubai/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^dest/i), "lhr");
    await user.tab();
    expect(await screen.findByText(/london/i)).toBeInTheDocument();

    const depInput = screen.getByLabelText(/departure/i);
    await user.clear(depInput);
    await user.type(depInput, "2026-08-10T08:45");

    const arrInput = screen.getByLabelText(/arrival/i);
    await user.type(arrInput, "2026-08-10T13:10");

    // No report row in the manual fallback form (flight-code-only entry, Plan 10 Task 3).
    expect(screen.queryByLabelText(/report/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add trip|submit/i }));

    await waitFor(() => expect(createTrip).toHaveBeenCalled());
    const payload = vi.mocked(createTrip).mock.calls[0]?.[0];
    expect(payload).toBeDefined();
    expect(payload!.legs).toHaveLength(1);
    expect(payload!.legs[0]).toMatchObject({
      flightNo: "EK002",
      origin: "DXB",
      dest: "LHR",
      depUtc: "2026-08-10T04:45:00.000Z",
      arrUtc: "2026-08-10T12:10:00.000Z",
    });
    // reportUtc is never included in the manual payload either — server-derived.
    expect(payload!.legs[0]).not.toHaveProperty("reportUtc");
    expect(onSubmitted).toHaveBeenCalled();
    // Manual path never confirms a schedule (no reference lookup was used).
    expect(confirmSchedule).not.toHaveBeenCalled();
  });

  it("manual path: shows a muted inline error for an unknown IATA code", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TripForm {...baseProps({ initialDate: "2026-08-20" })} />);
    await user.click(screen.getByTestId("manual-expand"));

    await user.type(screen.getByLabelText(/^origin/i), "zzz");
    await user.tab();

    const error = await screen.findByText(/unknown airport/i);
    expect(error).toBeInTheDocument();
    expect(error.className).toContain("text-ink-muted");
  });

  it("manual path: shows a muted error message when the API rejects the trip", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(createTrip).mockRejectedValue(new Error("unknown airport: ZZZ"));

    render(<TripForm {...baseProps({ initialDate: "2026-08-20" })} />);
    await user.click(screen.getByTestId("manual-expand"));

    await user.type(screen.getByLabelText(/flight no/i), "ek002");
    await user.type(screen.getByLabelText(/^origin/i), "dxb");
    await user.tab();
    await screen.findByText(/dubai/i);
    await user.type(screen.getByLabelText(/^dest/i), "lhr");
    await user.tab();
    await screen.findByText(/london/i);
    const depInput = screen.getByLabelText(/departure/i);
    await user.clear(depInput);
    await user.type(depInput, "2026-08-10T08:45");
    await user.type(screen.getByLabelText(/arrival/i), "2026-08-10T13:10");

    await user.click(screen.getByRole("button", { name: /add trip|submit/i }));

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent(/unknown airport: zzz/i);
    expect(error.className).toContain("text-ink-muted");
  });

  it("manual path: adds a leg prefilling origin from the previous dest and dep date from previous arrival", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TripForm {...baseProps({ initialDate: "2026-08-20" })} />);
    await user.click(screen.getByTestId("manual-expand"));

    await user.type(screen.getByLabelText(/^dest/i), "lhr");
    await user.tab();
    await screen.findByText(/london/i);
    await user.type(screen.getByLabelText(/arrival/i), "2026-08-10T13:10");

    await user.click(screen.getByRole("button", { name: /add leg/i }));

    const origins = screen.getAllByLabelText(/^origin/i);
    expect(origins[1]).toHaveValue("LHR");

    const deps = screen.getAllByLabelText(/departure/i);
    expect((deps[1] as HTMLInputElement).value.startsWith("2026-08-10")).toBe(true);
  });
});

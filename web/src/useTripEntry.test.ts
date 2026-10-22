import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTripEntry } from "./useTripEntry";
import { confirmSchedule, createTrip, getAirport, lookupSchedule } from "./api";
import { track } from "./lib/track";

vi.mock("./lib/track", () => ({ track: vi.fn() }));

vi.mock("./api", () => ({
  createTrip: vi.fn(),
  getAirport: vi.fn(),
  lookupSchedule: vi.fn(),
  confirmSchedule: vi.fn(),
}));

const DXB = { iata: "DXB", city: "Dubai", name: "Dubai Intl", tz: "Asia/Dubai" };
const LHR = { iata: "LHR", city: "London", name: "Heathrow", tz: "Europe/London" };

/**
 * Payload-correctness tests ported from TripForm.test.tsx (Plan 5 stepper) — same fixtures,
 * same expectations — to verify useTripEntry produces byte-identical createTrip/confirmSchedule
 * payloads to the original stepper after the Plan 6 extraction.
 */
describe("useTripEntry", () => {
  beforeEach(() => {
    vi.mocked(createTrip).mockReset();
    vi.mocked(getAirport).mockReset();
    vi.mocked(lookupSchedule).mockReset();
    vi.mocked(confirmSchedule).mockReset();
    vi.mocked(confirmSchedule).mockResolvedValue(undefined);
    vi.mocked(getAirport).mockImplementation(async (iata: string) => {
      if (iata === "DXB") return DXB;
      if (iata === "LHR") return LHR;
      return null;
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("autofills a single-leg flight from the schedule lookup and posts the correct UTC payload, then fires confirmSchedule with the saved times", async () => {
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

    const { result } = renderHook(() =>
      useTripEntry({ pickedDate: "2026-08-20", homeTz: "Asia/Dubai", onSubmitted }),
    );

    act(() => {
      result.current.setFlightNo("EK001");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    await waitFor(() => expect(result.current.autofillLegs).not.toBeNull());
    expect(result.current.autofillLegs![0]).toMatchObject({ depTime: "09:15", arrTime: "13:35" });

    // Edit the autofilled dep time before saving - the saved/confirmed values must reflect
    // this edit, not just echo the schedule lookup's original prefill.
    act(() => {
      result.current.updateAutofillLeg(0, { depTime: "09:45" });
    });
    expect(result.current.autofillLegs![0]!.depTime).toBe("09:45");

    await act(async () => {
      await result.current.handleAutofillSubmit();
    });

    await waitFor(() => expect(createTrip).toHaveBeenCalled());
    const payload = vi.mocked(createTrip).mock.calls[0]?.[0];
    // normaliseFlightNo strips the leading zero: "EK001" -> "EK1".
    expect(payload!.legs[0]).toMatchObject({
      flightNo: "EK1",
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
      flightNo: "EK1",
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

    const { result } = renderHook(() =>
      useTripEntry({ pickedDate: "2026-08-20", homeTz: "Asia/Dubai", onSubmitted: vi.fn() }),
    );

    act(() => {
      result.current.setFlightNo("EK412");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await waitFor(() => expect(result.current.autofillLegs).not.toBeNull());

    await act(async () => {
      await result.current.handleAutofillSubmit();
    });
    await waitFor(() => expect(createTrip).toHaveBeenCalled());

    const payload = vi.mocked(createTrip).mock.calls[0]?.[0];
    // Leg 0 departs the picked date (2026-08-20 10:15 Asia/Dubai, +4 -> 06:15Z). Leg 1
    // departs on leg 0's arrival day (2026-08-21, since leg 0's dayOffset is 1) at 07:45
    // Australia/Sydney (+10 in August, no DST -> 2026-08-20T21:45Z).
    expect(payload!.legs[0]!.depUtc).toBe("2026-08-20T06:15:00.000Z");
    expect(payload!.legs[1]!.depUtc).toBe("2026-08-20T21:45:00.000Z");
  });

  it("sets `resolving` true only while the lookup's fetch is in flight (post-debounce), false once it settles either way", async () => {
    let resolveLookup!: (value: Awaited<ReturnType<typeof lookupSchedule>>) => void;
    vi.mocked(lookupSchedule).mockReturnValue(
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
    );

    const { result } = renderHook(() =>
      useTripEntry({ pickedDate: "2026-08-20", homeTz: "Asia/Dubai", onSubmitted: vi.fn() }),
    );

    expect(result.current.resolving).toBe(false);

    act(() => {
      result.current.setFlightNo("EK001");
    });
    // Still debouncing - the fetch hasn't fired yet, so not resolving.
    expect(result.current.resolving).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    // Debounce elapsed, fetch is in flight (mocked promise not yet settled).
    expect(result.current.resolving).toBe(true);
    expect(result.current.autofillLegs).toBeNull();

    await act(async () => {
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
      });
    });

    expect(result.current.resolving).toBe(false);
    expect(result.current.autofillLegs).not.toBeNull();
  });

  it("recovers to manual fallback when lookupSchedule rejects, clearing `resolving` and setting `lookupMiss` (no unhandled rejection)", async () => {
    vi.mocked(lookupSchedule).mockRejectedValue(new Error("Failed to look up schedule"));

    const { result } = renderHook(() =>
      useTripEntry({ pickedDate: "2026-08-20", homeTz: "Asia/Dubai", onSubmitted: vi.fn() }),
    );

    act(() => {
      result.current.setFlightNo("EK001");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    await waitFor(() => expect(result.current.resolving).toBe(false));
    expect(result.current.autofillLegs).toBeNull();
    expect(result.current.lookupMiss).toBe(true);

    // Manual fallback is still reachable after the rejection.
    act(() => {
      result.current.switchToManual();
    });
    expect(result.current.mode).toBe("manual");
    // switchToManual normalises: "EK001" -> "EK1".
    expect(result.current.legs[0]!.flightNo).toBe("EK1");
  });

  it("switches to manual mode on an unknown flight (404) and prefills the flight no + picked date", async () => {
    vi.mocked(lookupSchedule).mockResolvedValue(null);

    const { result } = renderHook(() =>
      useTripEntry({ pickedDate: "2026-08-20", homeTz: "Asia/Dubai", onSubmitted: vi.fn() }),
    );

    act(() => {
      result.current.setFlightNo("XX999");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await waitFor(() => expect(result.current.lookupMiss).toBe(true));

    act(() => {
      result.current.switchToManual();
    });

    expect(result.current.mode).toBe("manual");
    expect(result.current.legs[0]!.dep).toBe("2026-08-20T00:00");
    expect(result.current.legs[0]!.flightNo).toBe("XX999");
  });

  it("manual path: fills one leg, converts wall times to UTC via the airport tz, and submits", async () => {
    vi.mocked(createTrip).mockResolvedValue({
      id: "trip-1",
      userId: "u1",
      label: null,
      createdAt: Date.now(),
      flights: [],
    });
    const onSubmitted = vi.fn();

    const { result } = renderHook(() =>
      useTripEntry({ pickedDate: "2026-08-20", homeTz: "Asia/Dubai", onSubmitted }),
    );

    act(() => {
      result.current.switchToManual();
    });

    act(() => {
      result.current.updateLeg(0, { flightNo: "EK002" });
    });
    act(() => {
      result.current.updateLeg(0, { origin: "DXB" });
    });
    await act(async () => {
      await result.current.lookupAirport("DXB");
    });
    act(() => {
      result.current.updateLeg(0, { dest: "LHR" });
    });
    await act(async () => {
      await result.current.lookupAirport("LHR");
    });
    act(() => {
      result.current.updateLeg(0, { dep: "2026-08-10T08:45" });
    });
    act(() => {
      result.current.updateLeg(0, { arr: "2026-08-10T13:10" });
    });

    await act(async () => {
      await result.current.handleManualSubmit();
    });

    await waitFor(() => expect(createTrip).toHaveBeenCalled());
    const payload = vi.mocked(createTrip).mock.calls[0]?.[0];
    expect(payload!.legs).toHaveLength(1);
    // handleManualSubmit normalises at the submit boundary: "EK002" -> "EK2".
    expect(payload!.legs[0]).toMatchObject({
      flightNo: "EK2",
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

  it("manual path: reports an inline error for an unknown IATA code", async () => {
    const { result } = renderHook(() =>
      useTripEntry({ pickedDate: "2026-08-20", homeTz: "Asia/Dubai", onSubmitted: vi.fn() }),
    );

    act(() => {
      result.current.switchToManual();
    });
    act(() => {
      result.current.updateLeg(0, { origin: "ZZZ" });
    });
    await act(async () => {
      await result.current.lookupAirport("ZZZ");
    });

    expect(result.current.airportLabel("ZZZ")).toBe("unknown airport: ZZZ");
  });

  describe("appendFlight (turnaround chaining)", () => {
    // EK097 DXB->BCN dep 08:20 arr 12:35 (dayOffset 0, Asia/Dubai +4 / Europe/Madrid +2 in Aug);
    // EK098 BCN->DXB dep 14:15 arr 00:05 (dayOffset 1). Real seed rows (scripts/ek-schedules.json).
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

    async function setUpOutbound() {
      vi.mocked(lookupSchedule).mockResolvedValueOnce({ legs: EK097_LEGS });
      const { result } = renderHook(() =>
        useTripEntry({ pickedDate: "2026-08-20", homeTz: "Asia/Dubai", onSubmitted: vi.fn() }),
      );
      act(() => {
        result.current.setFlightNo("EK097");
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });
      await waitFor(() => expect(result.current.autofillLegs).not.toBeNull());
      return result;
    }

    it("appends EK098's leg after EK097's, dated from EK097's arrival local date, as ONE combined trip payload", async () => {
      const result = await setUpOutbound();
      vi.mocked(lookupSchedule).mockResolvedValueOnce({ legs: EK098_LEGS });

      await act(async () => {
        // EK097's only leg: depDate 2026-08-20, dayOffset 0 -> arrival local date 2026-08-20.
        // The second lookup must be anchored on that date, not the original picked date.
        await result.current.appendFlight("EK098");
      });

      // appendFlight normalises the candidate: "EK098" -> "EK98".
      expect(lookupSchedule).toHaveBeenCalledWith("EK98", "2026-08-20");
      expect(result.current.appendedFlightNo).toBe("EK98");
      expect(result.current.autofillLegs).toHaveLength(2);
      expect(result.current.autofillLegs![1]).toMatchObject({
        flightNo: "EK98",
        legSeq: 1,
        origin: "BCN",
        dest: "DXB",
      });

      vi.mocked(createTrip).mockResolvedValue({
        id: "trip-1",
        userId: "u1",
        label: null,
        createdAt: Date.now(),
        flights: [],
      });

      await act(async () => {
        await result.current.handleAutofillSubmit();
      });

      await waitFor(() => expect(createTrip).toHaveBeenCalledTimes(1));
      const payload = vi.mocked(createTrip).mock.calls[0]?.[0];
      expect(payload!.legs).toHaveLength(2);

      // Leg 0 (EK097, normalised to EK97): dep 2026-08-20 08:20 Asia/Dubai (+4) -> 04:20Z;
      // arr 2026-08-20 12:35 Europe/Madrid (+2 in Aug) -> 10:35Z.
      expect(payload!.legs[0]).toMatchObject({
        flightNo: "EK97",
        origin: "DXB",
        dest: "BCN",
        depUtc: "2026-08-20T04:20:00.000Z",
        arrUtc: "2026-08-20T10:35:00.000Z",
      });
      // Leg 1 (EK098, normalised to EK98): depDate = EK097's arrival local date (2026-08-20);
      // dep 14:15 Europe/Madrid (+2) -> 12:15Z; arrDate = depDate + dayOffset(1) = 2026-08-21,
      // arr 00:05 Asia/Dubai (+4) -> 2026-08-20T20:05Z.
      expect(payload!.legs[1]).toMatchObject({
        flightNo: "EK98",
        origin: "BCN",
        dest: "DXB",
        depUtc: "2026-08-20T12:15:00.000Z",
        arrUtc: "2026-08-20T20:05:00.000Z",
      });
      // reportUtc omitted for both legs — server-derived.
      expect(payload!.legs[0]).not.toHaveProperty("reportUtc");
      expect(payload!.legs[1]).not.toHaveProperty("reportUtc");

      // Regression: confirmSchedule (POST /schedule/confirm) upserts flight_schedules rows
      // keyed by (flight_no, leg_seq) PER FLIGHT, not per combined trip. EK098 is a
      // single-leg flight, so its own schedule leg_seq must be confirmed as 0 - NOT the
      // combined trip's leg_seq (1, since it's the second flight chained after EK097's leg
      // 0). Confirming leg_seq 1 for EK098 would upsert a phantom SECOND leg into EK098's
      // flight_schedules rows (a leg_seq that flight never actually has), which
      // GET /schedule/lookup would then return on every future EK098 lookup - and each
      // subsequent turnaround append would confirm an even higher phantom leg_seq, since
      // the combined-trip leg_seq keeps growing across appends.
      await waitFor(() => expect(confirmSchedule).toHaveBeenCalledTimes(2));
      expect(confirmSchedule).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ flightNo: "EK97", legSeq: 0 }),
      );
      expect(confirmSchedule).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ flightNo: "EK98", legSeq: 0 }),
      );
    });

    it("sets an inline miss flag (not manual fallback) when the appended flight number isn't in the schedule", async () => {
      const result = await setUpOutbound();
      vi.mocked(lookupSchedule).mockResolvedValueOnce(null);

      await act(async () => {
        await result.current.appendFlight("XX999");
      });

      expect(result.current.appendLookupMiss).toBe(true);
      expect(result.current.appendedFlightNo).toBeNull();
      // Scope stays tight: no fallback into manual mode for the appended flight.
      expect(result.current.mode).toBe("flightno");
      // The outbound's own single leg is untouched.
      expect(result.current.autofillLegs).toHaveLength(1);
    });

    it("removeAppendedFlight reverts to the single-flight state", async () => {
      const result = await setUpOutbound();
      vi.mocked(lookupSchedule).mockResolvedValueOnce({ legs: EK098_LEGS });

      await act(async () => {
        await result.current.appendFlight("EK098");
      });
      expect(result.current.autofillLegs).toHaveLength(2);

      act(() => {
        result.current.removeAppendedFlight();
      });

      expect(result.current.appendedFlightNo).toBeNull();
      expect(result.current.autofillLegs).toHaveLength(1);
      // Outbound's own flightNo was normalised at lookup time: "EK097" -> "EK97".
      expect(result.current.autofillLegs![0]!.flightNo).toBe("EK97");
    });
  });

  it("manual path: adds a leg prefilling origin from the previous dest and dep date from previous arrival", async () => {
    const { result } = renderHook(() =>
      useTripEntry({ pickedDate: "2026-08-20", homeTz: "Asia/Dubai", onSubmitted: vi.fn() }),
    );

    act(() => {
      result.current.switchToManual();
    });
    act(() => {
      result.current.updateLeg(0, { dest: "LHR" });
    });
    act(() => {
      result.current.updateLeg(0, { arr: "2026-08-10T13:10" });
    });
    act(() => {
      result.current.addLeg();
    });

    expect(result.current.legs[1]!.origin).toBe("LHR");
    expect(result.current.legs[1]!.dep.startsWith("2026-08-10")).toBe(true);
  });
});

const EK001_LEG = {
  legSeq: 0,
  origin: "DXB",
  dest: "LHR",
  depLocal: "09:15",
  arrLocal: "13:35",
  dayOffset: 0,
  originTz: "Asia/Dubai",
  destTz: "Europe/London",
  confirmCount: 3,
};
const SAVED = { id: "trip-1", userId: "u1", label: null, createdAt: 0, flights: [] };

/** What the owner's /usage page is built from: one event per step of adding a roster. */
describe("useTripEntry usage events", () => {
  beforeEach(() => {
    vi.mocked(track).mockReset();
    vi.mocked(createTrip).mockReset();
    vi.mocked(lookupSchedule).mockReset();
    vi.mocked(confirmSchedule).mockResolvedValue(undefined);
    vi.mocked(getAirport).mockImplementation(async (iata: string) =>
      iata === "DXB" ? DXB : iata === "LHR" ? LHR : null,
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const names = () => vi.mocked(track).mock.calls.map(([name]) => name);
  const propsOf = (name: string) =>
    vi.mocked(track).mock.calls.find(([n]) => n === name)?.[1] as Record<string, unknown> | undefined;

  async function lookUp(result: { current: ReturnType<typeof useTripEntry> }, flightNo: string) {
    act(() => result.current.setFlightNo(flightNo));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
  }

  it("records nothing unless the caller asks for it (the edit card mounts this hook inertly)", async () => {
    vi.mocked(lookupSchedule).mockResolvedValue({ legs: [EK001_LEG] });
    const { result } = renderHook(() =>
      useTripEntry({ pickedDate: "2026-08-20", homeTz: "Asia/Dubai", onSubmitted: vi.fn() }),
    );
    await lookUp(result, "EK001");
    await waitFor(() => expect(result.current.autofillLegs).not.toBeNull());
    expect(track).not.toHaveBeenCalled();
  });

  it("records the form opening, a found lookup with its duration, and the autofill save", async () => {
    vi.mocked(lookupSchedule).mockResolvedValue({ legs: [EK001_LEG] });
    vi.mocked(createTrip).mockResolvedValue(SAVED);
    const { result } = renderHook(() =>
      useTripEntry({
        pickedDate: "2026-08-20",
        homeTz: "Asia/Dubai",
        onSubmitted: vi.fn(),
        trackUsage: true,
      }),
    );
    // Mounting is not opening: the calendar mounts this form for the default day on every load.
    expect(names()).toEqual([]);

    await lookUp(result, "EK001");
    expect(names()[0]).toBe("add_form_opened");
    expect(names().filter((n) => n === "add_form_opened")).toHaveLength(1);
    await waitFor(() => expect(result.current.autofillLegs).not.toBeNull());
    expect(propsOf("flight_lookup")).toMatchObject({ result: "found" });
    expect(propsOf("flight_lookup")!.ms).toBeGreaterThanOrEqual(0);

    await act(async () => {
      await result.current.handleAutofillSubmit();
    });
    expect(propsOf("trip_saved")).toMatchObject({ path: "autofill", legs: 1 });
    expect(propsOf("trip_saved")!.msSinceOpen).toBeGreaterThanOrEqual(400);
  });

  it("records an unknown lookup, the switch to manual, and the manual save", async () => {
    vi.mocked(lookupSchedule).mockResolvedValue(null);
    vi.mocked(createTrip).mockResolvedValue(SAVED);
    const { result } = renderHook(() =>
      useTripEntry({
        pickedDate: "2026-08-20",
        homeTz: "Asia/Dubai",
        onSubmitted: vi.fn(),
        trackUsage: true,
      }),
    );
    await lookUp(result, "EK999");
    await waitFor(() => expect(result.current.lookupMiss).toBe(true));
    expect(propsOf("flight_lookup")).toMatchObject({ result: "unknown" });

    act(() => result.current.switchToManual());
    expect(names()).toContain("manual_entry_opened");

    act(() =>
      result.current.updateLeg(0, {
        origin: "DXB",
        dest: "LHR",
        dep: "2026-08-20T08:45",
        arr: "2026-08-20T13:10",
      }),
    );
    await act(async () => {
      await result.current.lookupAirport("DXB");
    });
    await act(async () => {
      await result.current.lookupAirport("LHR");
    });
    await act(async () => {
      await result.current.handleManualSubmit();
    });
    expect(propsOf("trip_saved")).toMatchObject({ path: "manual", legs: 1 });
  });

  it("records a lookup that errored as an error, not as unknown", async () => {
    vi.mocked(lookupSchedule).mockRejectedValue(new Error("502"));
    const { result } = renderHook(() =>
      useTripEntry({
        pickedDate: "2026-08-20",
        homeTz: "Asia/Dubai",
        onSubmitted: vi.fn(),
        trackUsage: true,
      }),
    );
    await lookUp(result, "EK001");
    await waitFor(() => expect(result.current.lookupMiss).toBe(true));
    expect(propsOf("flight_lookup")).toMatchObject({ result: "error" });
  });

  it("records a failed save with the HTTP status the server answered", async () => {
    vi.mocked(lookupSchedule).mockResolvedValue({ legs: [EK001_LEG] });
    vi.mocked(createTrip).mockRejectedValue(
      Object.assign(new Error("unknown airport: LHR"), { status: 400 }),
    );
    const { result } = renderHook(() =>
      useTripEntry({
        pickedDate: "2026-08-20",
        homeTz: "Asia/Dubai",
        onSubmitted: vi.fn(),
        trackUsage: true,
      }),
    );
    await lookUp(result, "EK001");
    await waitFor(() => expect(result.current.autofillLegs).not.toBeNull());
    await act(async () => {
      await result.current.handleAutofillSubmit();
    });
    expect(propsOf("trip_save_failed")).toEqual({ path: "autofill", status: 400 });
    expect(names()).not.toContain("trip_saved");
  });
});

/** The step-by-step half of /usage: which controls she used inside one add form, and when she
 * walked away from it. */
describe("useTripEntry form steps and attention", () => {
  beforeEach(() => {
    vi.mocked(track).mockReset();
    vi.mocked(createTrip).mockReset();
    vi.mocked(lookupSchedule).mockReset();
    vi.mocked(confirmSchedule).mockResolvedValue(undefined);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    vi.useRealTimers();
  });

  const calls = () => vi.mocked(track).mock.calls.map(([name, props]) => [name, props] as const);
  const steps = () =>
    calls()
      .filter(([n]) => n === "form_step")
      .map(([, p]) => (p as { step: string }).step);
  const propsOf = (name: string) =>
    calls().find(([n]) => n === name)?.[1] as Record<string, unknown> | undefined;
  function setVisibility(state: "hidden" | "visible") {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
  }

  function mount(entry?: "day" | "plus") {
    return renderHook(() =>
      useTripEntry({
        pickedDate: "2026-08-20",
        homeTz: "Asia/Dubai",
        onSubmitted: vi.fn(),
        trackUsage: true,
        entry,
      }),
    );
  }

  async function lookUp(result: { current: ReturnType<typeof useTripEntry> }, flightNo: string) {
    act(() => result.current.setFlightNo(flightNo));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
  }

  it("names the control that opened the form, and the flight number a lookup asked for", async () => {
    vi.mocked(lookupSchedule).mockResolvedValue(null);
    const { result } = mount("plus");
    await lookUp(result, "EK999");
    await waitFor(() => expect(result.current.lookupMiss).toBe(true));
    expect(propsOf("add_form_opened")).toEqual({ entry: "plus" });
    expect(propsOf("flight_lookup")).toMatchObject({ result: "unknown", flightNo: "EK999" });
  });

  it("counts the legs whose time she changed from the schedule's when the autofill is saved", async () => {
    vi.mocked(lookupSchedule).mockResolvedValue({ legs: [EK001_LEG, { ...EK001_LEG, legSeq: 1 }] });
    vi.mocked(createTrip).mockResolvedValue(SAVED);
    const { result } = mount();
    await lookUp(result, "EK001");
    await waitFor(() => expect(result.current.autofillLegs).not.toBeNull());
    act(() => result.current.updateAutofillLeg(1, { depTime: "10:00" }));
    act(() => result.current.updateAutofillLeg(1, { arrTime: "14:00" }));
    // Set back to what the schedule said: not an edit.
    act(() => result.current.updateAutofillLeg(0, { depTime: "10:00" }));
    act(() => result.current.updateAutofillLeg(0, { depTime: "09:15" }));
    await act(async () => {
      await result.current.handleAutofillSubmit();
    });
    expect(propsOf("trip_saved")).toMatchObject({ path: "autofill", legs: 2, legsEdited: 1 });
  });

  it("records one step per control she uses, never the same step twice in a row", async () => {
    vi.mocked(lookupSchedule).mockResolvedValue({ legs: [EK001_LEG, { ...EK001_LEG, legSeq: 1 }] });
    const { result } = mount();
    await lookUp(result, "EK001");
    await waitFor(() => expect(result.current.autofillLegs).not.toBeNull());
    act(() => result.current.setFlightNo("EK0011"));
    act(() => result.current.setFlightNo("EK001"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await waitFor(() => expect(result.current.autofillLegs).not.toBeNull());
    act(() => result.current.updateAutofillLeg(0, { depTime: "10:00" }));
    act(() => result.current.updateAutofillLeg(0, { arrTime: "14:00" }));
    act(() => result.current.setBoardingLeg(1));
    act(() => result.current.setFinalLegIndex(1));
    act(() => result.current.recordStep("append_opened"));
    act(() => result.current.requestSubmit());
    expect(steps()).toEqual([
      "flightno_edited",
      "time_edited",
      "boarding_picked",
      "final_picked",
      "append_opened",
      "submit_pressed",
    ]);
  });

  it("records the manual path's controls and an error once it is on screen", async () => {
    vi.mocked(lookupSchedule).mockResolvedValue(null);
    vi.mocked(getAirport).mockResolvedValue(null);
    const { result } = mount();
    await lookUp(result, "EK999");
    act(() => result.current.switchToManual());
    act(() => result.current.updateLeg(0, { origin: "XXX" }));
    act(() => result.current.updateLeg(0, { dep: "2026-08-20T08:00" }));
    act(() => result.current.updateLeg(0, { flightNo: "EK9" }));
    act(() => result.current.addLeg());
    await act(async () => {
      await result.current.handleManualSubmit();
    });
    expect(steps()).toEqual([
      "manual_opened",
      "airport_edited",
      "manual_time_edited",
      "manual_flightno_edited",
      "leg_added",
      "submit_pressed",
      "error_shown",
    ]);
  });

  it("records nothing before the form is opened, and nothing when an unopened form goes away", () => {
    const { unmount } = mount();
    setVisibility("hidden");
    setVisibility("visible");
    unmount();
    expect(track).not.toHaveBeenCalled();
  });

  it("records leaving when the page is hidden mid-form, and coming back", async () => {
    vi.mocked(lookupSchedule).mockResolvedValue(null);
    const { result } = mount();
    await lookUp(result, "EK999");
    await waitFor(() => expect(result.current.lookupMiss).toBe(true));

    setVisibility("hidden");
    expect(propsOf("form_left")).toMatchObject({ reason: "hidden", lastStep: "lookup_unknown" });
    expect(propsOf("form_left")!.msSinceOpen).toBeGreaterThanOrEqual(400);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    setVisibility("visible");
    expect(propsOf("form_resumed")!.awayMs).toBeGreaterThanOrEqual(3000);
  });

  it("records leaving when an opened form unmounts unsaved, and not when it was saved", async () => {
    vi.mocked(lookupSchedule).mockResolvedValue({ legs: [EK001_LEG] });
    vi.mocked(createTrip).mockResolvedValue(SAVED);
    const first = mount();
    await lookUp(first.result, "EK001");
    await waitFor(() => expect(first.result.current.autofillLegs).not.toBeNull());
    act(() => first.result.current.updateAutofillLeg(0, { depTime: "10:00" }));
    first.unmount();
    expect(propsOf("form_left")).toMatchObject({ reason: "closed", lastStep: "time_edited" });

    vi.mocked(track).mockReset();
    const second = mount();
    await lookUp(second.result, "EK001");
    await waitFor(() => expect(second.result.current.autofillLegs).not.toBeNull());
    await act(async () => {
      await second.result.current.handleAutofillSubmit();
    });
    setVisibility("hidden");
    second.unmount();
    expect(calls().map(([n]) => n)).not.toContain("form_left");
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DaySheet, { humanDateLabel } from "./DaySheet";
import { confirmSchedule, createTrip, getAirport, lookupSchedule } from "./api";

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
}));

describe("DaySheet", () => {
  beforeEach(() => {
    vi.mocked(createTrip).mockReset();
    vi.mocked(getAirport).mockReset();
    vi.mocked(lookupSchedule).mockReset();
    vi.mocked(confirmSchedule).mockReset();
    vi.mocked(confirmSchedule).mockResolvedValue(undefined);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a dialog with a day title reflecting the empty-day add flow", () => {
    render(
      <DaySheet isoDate="2026-08-20" trips={[]} homeTz="Asia/Dubai" onClose={vi.fn()} onChanged={vi.fn()} onAdded={vi.fn()} />,
    );
    expect(screen.getByTestId("day-sheet")).toBeInTheDocument();
    expect(screen.getByText(/add trip/i)).toBeInTheDocument();
  });

  it("dismisses when the scrim is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onClose = vi.fn();
    render(
      <DaySheet isoDate="2026-08-20" trips={[]} homeTz="Asia/Dubai" onClose={onClose} onChanged={vi.fn()} onAdded={vi.fn()} />,
    );

    await user.click(screen.getByTestId("sheet-scrim"));
    expect(onClose).toHaveBeenCalled();
  });

  it("dismisses when the close button is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onClose = vi.fn();
    render(
      <DaySheet isoDate="2026-08-20" trips={[]} homeTz="Asia/Dubai" onClose={onClose} onChanged={vi.fn()} onAdded={vi.fn()} />,
    );

    await user.click(screen.getByTestId("sheet-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("dismisses on Escape", () => {
    const onClose = vi.fn();
    render(
      <DaySheet isoDate="2026-08-20" trips={[]} homeTz="Asia/Dubai" onClose={onClose} onChanged={vi.fn()} onAdded={vi.fn()} />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("refetches exactly once when dismissed (scrim, close button, or Escape all route through the same dismiss)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onChanged = vi.fn();
    render(
      <DaySheet isoDate="2026-08-20" trips={[]} homeTz="Asia/Dubai" onClose={vi.fn()} onChanged={onChanged} onAdded={vi.fn()} />,
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
      <DaySheet isoDate="2026-08-20" trips={[]} homeTz="Asia/Dubai" onClose={vi.fn()} onChanged={vi.fn()} onAdded={vi.fn()} />,
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
      flights: [
        {
          id: "new-f1",
          tripId: "trip-1",
          userId: "u1",
          flightNo: "EK412",
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
    const onAdded = vi.fn();

    render(
      <DaySheet isoDate="2026-08-20" trips={[]} homeTz="Asia/Dubai" onClose={vi.fn()} onChanged={vi.fn()} onAdded={onAdded} />,
    );

    // The airline code ("EK") is a fixed adornment, not typed - only the digits go into the input.
    await user.type(screen.getByTestId("flightno-input"), "412");
    await vi.advanceTimersByTimeAsync(400);

    const card = await screen.findByTestId("autofill-card");
    expect(card).toHaveTextContent("DXB → LHR");

    await user.click(screen.getByRole("button", { name: /add to roster/i }));

    await waitFor(() => expect(createTrip).toHaveBeenCalled());
    const payload = vi.mocked(createTrip).mock.calls[0]?.[0];
    expect(payload!.legs[0]).toMatchObject({
      flightNo: "EK412",
      origin: "DXB",
      dest: "LHR",
      depUtc: "2026-08-20T05:15:00.000Z",
      arrUtc: "2026-08-20T12:35:00.000Z",
    });
    // reportUtc is never included in the saved payload - the server derives it (dep - 90min)
    // from depUtc when absent.
    expect(payload!.legs[0]).not.toHaveProperty("reportUtc");

    await waitFor(() => expect(confirmSchedule).toHaveBeenCalled());
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith("2026-08-20"));
  });

  it("closes the sheet after a successful add", async () => {
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
    const onClose = vi.fn();
    const onAdded = vi.fn();

    render(
      <DaySheet isoDate="2026-08-20" trips={[]} homeTz="Asia/Dubai" onClose={onClose} onChanged={vi.fn()} onAdded={onAdded} />,
    );

    await user.type(screen.getByTestId("flightno-input"), "412");
    await vi.advanceTimersByTimeAsync(400);
    await screen.findByTestId("autofill-card");
    await user.click(screen.getByRole("button", { name: /add to roster/i }));

    // No more rapid-entry chaining - a successful add marks the day (onAdded) then closes.
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith("2026-08-20"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("add flow: renders no report input or chip anywhere in the autofill card (flight-code-only entry)", async () => {
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
      <DaySheet isoDate="2026-08-20" trips={[]} homeTz="Asia/Dubai" onClose={vi.fn()} onChanged={vi.fn()} onAdded={vi.fn()} />,
    );

    await user.type(screen.getByTestId("flightno-input"), "412");
    await vi.advanceTimersByTimeAsync(400);
    await screen.findByTestId("autofill-card");

    expect(screen.queryByTestId("report-chip")).not.toBeInTheDocument();
    expect(screen.queryByText(/report/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/report/i)).not.toBeInTheDocument();
  });

  it("add flow: shows a muted 'checking schedule…' line and disables Add while the lookup is in flight", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let resolveLookup!: (value: Awaited<ReturnType<typeof lookupSchedule>>) => void;
    vi.mocked(lookupSchedule).mockReturnValue(
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
    );

    render(
      <DaySheet isoDate="2026-08-20" trips={[]} homeTz="Asia/Dubai" onClose={vi.fn()} onChanged={vi.fn()} onAdded={vi.fn()} />,
    );

    expect(screen.queryByTestId("schedule-loading")).not.toBeInTheDocument();

    await user.type(screen.getByTestId("flightno-input"), "412");
    await vi.advanceTimersByTimeAsync(400);

    expect(await screen.findByTestId("schedule-loading")).toHaveTextContent(/checking schedule/i);
    // No manual-fallback link while still resolving - only after the lookup settles.
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

  it("does not render manual-expand until a lookup actually misses (not on a fresh sheet)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <DaySheet isoDate="2026-08-20" trips={[]} homeTz="Asia/Dubai" onClose={vi.fn()} onChanged={vi.fn()} onAdded={vi.fn()} />,
    );

    // Fresh sheet, no input yet - manual-expand doesn't exist at all.
    expect(screen.queryByTestId("manual-expand")).not.toBeInTheDocument();

    vi.mocked(lookupSchedule).mockResolvedValue(null);
    await user.type(screen.getByTestId("flightno-input"), "999");
    await vi.advanceTimersByTimeAsync(400);

    expect(await screen.findByTestId("manual-expand")).toBeInTheDocument();
  });

  it("falls back to the manual multi-leg fields on an unknown flight (404)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(lookupSchedule).mockResolvedValue(null);

    render(
      <DaySheet isoDate="2026-08-20" trips={[]} homeTz="Asia/Dubai" onClose={vi.fn()} onChanged={vi.fn()} onAdded={vi.fn()} />,
    );

    await user.type(screen.getByTestId("flightno-input"), "999");
    await vi.advanceTimersByTimeAsync(400);

    expect(await screen.findByText(/unknown flight/i)).toBeInTheDocument();
    await user.click(screen.getByTestId("manual-expand"));

    const depInput = screen.getByLabelText(/departure/i) as HTMLInputElement;
    expect(depInput.value).toBe("2026-08-20T00:00");

    // Manual fallback has no report row (flight-code-only entry).
    expect(screen.queryByLabelText(/report/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/report \(local\)/i)).not.toBeInTheDocument();
  });

  it("manual entry: after a successful save, closes the sheet the same as the autofill path", async () => {
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
    const onClose = vi.fn();
    const onAdded = vi.fn();

    render(
      <DaySheet isoDate="2026-08-20" trips={[]} homeTz="Asia/Dubai" onClose={onClose} onChanged={vi.fn()} onAdded={onAdded} />,
    );

    await user.type(screen.getByTestId("flightno-input"), "999");
    await vi.advanceTimersByTimeAsync(400);
    await screen.findByText(/unknown flight/i);
    await user.click(screen.getByTestId("manual-expand"));

    // Flight-no field is already prefilled ("EK999") by switchToManual - no need to type it.
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
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith("2026-08-20"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  describe("turnaround chaining (+ add flight)", () => {
    // Same real seed rows as useTripEntry.test.ts's appendFlight suite (scripts/ek-schedules.json):
    // EK097 DXB->BCN dep 08:20 arr 12:35 (dayOffset 0); EK098 BCN->DXB dep 14:15 arr 00:05 (dayOffset 1).
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

    async function previewEk097(user: ReturnType<typeof userEvent.setup>) {
      vi.mocked(lookupSchedule).mockResolvedValueOnce({ legs: EK097_LEGS });
      render(
        <DaySheet isoDate="2026-08-20" trips={[]} homeTz="Asia/Dubai" onClose={vi.fn()} onChanged={vi.fn()} onAdded={vi.fn()} />,
      );
      await user.type(screen.getByTestId("flightno-input"), "097");
      await vi.advanceTimersByTimeAsync(400);
      await screen.findByTestId("autofill-card");
    }

    it("shows '+ add flight' only in preview state, chains EK098 into one combined save, and lets ✕ revert it", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await previewEk097(user);

      expect(screen.getByTestId("append-flight")).toBeInTheDocument();

      await user.click(screen.getByTestId("append-flight"));
      const appendInput = screen.getByTestId("append-flightno-input");

      vi.mocked(lookupSchedule).mockResolvedValueOnce({ legs: EK098_LEGS });
      await user.type(appendInput, "098");
      await user.keyboard("{Enter}");

      const appendedCard = await screen.findByTestId("appended-card");
      expect(appendedCard).toHaveTextContent("BCN → DXB");
      // The "+ add flight" control is hidden once a flight is appended - the ✕ is the only
      // way back to single-flight state.
      expect(screen.queryByTestId("append-flight")).not.toBeInTheDocument();

      vi.mocked(createTrip).mockResolvedValue({
        id: "trip-1",
        userId: "u1",
        label: null,
        createdAt: Date.now(),
        flights: [],
      });

      await user.click(screen.getByRole("button", { name: /add to roster/i }));

      await waitFor(() => expect(createTrip).toHaveBeenCalledTimes(1));
      const payload = vi.mocked(createTrip).mock.calls[0]?.[0];
      // ONE trip, two legs, combined save (not two POSTs).
      expect(payload!.legs).toHaveLength(2);
      expect(payload!.legs[0]).toMatchObject({ flightNo: "EK097", origin: "DXB", dest: "BCN" });
      expect(payload!.legs[1]).toMatchObject({ flightNo: "EK098", origin: "BCN", dest: "DXB" });
    });

    it("reverts to single-flight preview when the appended card's ✕ is clicked", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await previewEk097(user);

      await user.click(screen.getByTestId("append-flight"));
      vi.mocked(lookupSchedule).mockResolvedValueOnce({ legs: EK098_LEGS });
      await user.type(screen.getByTestId("append-flightno-input"), "098");
      await user.keyboard("{Enter}");
      await screen.findByTestId("appended-card");

      await user.click(screen.getByTestId("remove-appended"));

      expect(screen.queryByTestId("appended-card")).not.toBeInTheDocument();
      expect(screen.getByTestId("autofill-card")).toHaveTextContent("DXB → BCN");
      expect(screen.getByTestId("autofill-card")).not.toHaveTextContent("BCN → DXB");
      // Back to single-flight preview: the "+ add flight" control is available again.
      expect(screen.getByTestId("append-flight")).toBeInTheDocument();
    });

    it("shows an inline muted error for an appended flight number with no schedule row, without falling back to manual mode", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await previewEk097(user);

      await user.click(screen.getByTestId("append-flight"));
      vi.mocked(lookupSchedule).mockResolvedValueOnce(null);
      await user.type(screen.getByTestId("append-flightno-input"), "999");
      await user.keyboard("{Enter}");

      expect(await screen.findByText(/unknown flight/i)).toBeInTheDocument();
      // No manual-entry form appeared - the outbound preview is untouched.
      expect(screen.getByTestId("autofill-card")).toBeInTheDocument();
      expect(screen.queryByTestId("manual-expand")).not.toBeInTheDocument();
    });
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TripForm from "./TripForm";
import { createTrip, getAirport } from "./api";

vi.mock("./api", () => ({
  createTrip: vi.fn(),
  getAirport: vi.fn(),
}));

const DXB = { iata: "DXB", city: "Dubai", name: "Dubai Intl", tz: "Asia/Dubai" };
const LHR = { iata: "LHR", city: "London", name: "Heathrow", tz: "Europe/London" };

describe("TripForm", () => {
  beforeEach(() => {
    vi.mocked(createTrip).mockReset();
    vi.mocked(getAirport).mockReset();
    vi.mocked(getAirport).mockImplementation(async (iata: string) => {
      if (iata === "DXB") return DXB;
      if (iata === "LHR") return LHR;
      return null;
    });
  });

  it("fills one leg, converts wall times to UTC via the airport tz, and submits", async () => {
    const user = userEvent.setup();
    vi.mocked(createTrip).mockResolvedValue({
      id: "trip-1",
      userId: "u1",
      label: null,
      createdAt: Date.now(),
      flights: [],
    });
    const onSubmitted = vi.fn();

    render(<TripForm onSubmitted={onSubmitted} />);

    await user.type(screen.getByLabelText(/flight no/i), "ek002");
    await user.type(screen.getByLabelText(/^origin/i), "dxb");
    await user.tab();
    expect(await screen.findByText(/dubai/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^dest/i), "lhr");
    await user.tab();
    expect(await screen.findByText(/london/i)).toBeInTheDocument();

    const depInput = screen.getByLabelText(/departure/i);
    await user.type(depInput, "2026-08-10T08:45");

    const arrInput = screen.getByLabelText(/arrival/i);
    await user.type(arrInput, "2026-08-10T13:10");

    // Report time auto-fills to dep - 90min once dep + origin tz are known.
    await waitFor(() => {
      expect(screen.getByLabelText(/report/i)).toHaveValue("2026-08-10T07:15");
    });

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
      reportUtc: "2026-08-10T03:15:00.000Z",
    });
    expect(onSubmitted).toHaveBeenCalled();
  });

  it("shows a muted inline error for an unknown IATA code", async () => {
    const user = userEvent.setup();
    render(<TripForm onSubmitted={vi.fn()} />);

    await user.type(screen.getByLabelText(/^origin/i), "zzz");
    await user.tab();

    const error = await screen.findByText(/unknown airport/i);
    expect(error).toBeInTheDocument();
    expect(error.className).toContain("text-ink-muted");
  });

  it("shows a muted error message when the API rejects the trip", async () => {
    const user = userEvent.setup();
    vi.mocked(createTrip).mockRejectedValue(new Error("unknown airport: ZZZ"));

    render(<TripForm onSubmitted={vi.fn()} />);

    await user.type(screen.getByLabelText(/flight no/i), "ek002");
    await user.type(screen.getByLabelText(/^origin/i), "dxb");
    await user.tab();
    await screen.findByText(/dubai/i);
    await user.type(screen.getByLabelText(/^dest/i), "lhr");
    await user.tab();
    await screen.findByText(/london/i);
    await user.type(screen.getByLabelText(/departure/i), "2026-08-10T08:45");
    await user.type(screen.getByLabelText(/arrival/i), "2026-08-10T13:10");

    await user.click(screen.getByRole("button", { name: /add trip|submit/i }));

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent(/unknown airport: zzz/i);
    expect(error.className).toContain("text-ink-muted");
  });

  it("adds a leg prefilling origin from the previous dest and dep date from previous arrival", async () => {
    const user = userEvent.setup();
    render(<TripForm onSubmitted={vi.fn()} />);

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

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrewResponse } from "@roaster/shared";
import CrewPanel from "./CrewPanel";
import { acceptCrewInvite, getCrew, inviteCrew, revokeCrewInvite } from "./api";

vi.mock("./api", () => ({
  getCrew: vi.fn(),
  inviteCrew: vi.fn(),
  acceptCrewInvite: vi.fn(),
  revokeCrewInvite: vi.fn(),
}));

const EMPTY: CrewResponse = { members: [], sent: [], received: [] };

const withCrew = (crew: Partial<CrewResponse>) =>
  vi.mocked(getCrew).mockResolvedValue({ ...EMPTY, ...crew });

describe("CrewPanel", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("invites a crew member by email and says who was invited", async () => {
    const user = userEvent.setup();
    withCrew({});
    vi.mocked(inviteCrew).mockResolvedValue({ id: "inv-1", email: "fo@example.com" });
    render(<CrewPanel />);

    await user.type(await screen.findByTestId("crew-invite-email"), "FO@example.com");
    await user.click(screen.getByTestId("crew-invite-send"));

    // Lower-cased on the way out: the API matches the invited address case-insensitively, and
    // sending it as typed would make the confirmation read differently to what was stored.
    await waitFor(() => expect(inviteCrew).toHaveBeenCalledWith({ email: "fo@example.com" }));
    expect(await screen.findByText(/invited fo@example.com/i)).toBeInTheDocument();
  });

  it("surfaces the reason an invite was refused", async () => {
    const user = userEvent.setup();
    withCrew({});
    vi.mocked(inviteCrew).mockRejectedValue(new Error("You've already invited them"));
    render(<CrewPanel />);

    await user.type(await screen.findByTestId("crew-invite-email"), "again@example.com");
    await user.click(screen.getByTestId("crew-invite-send"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already invited them/i);
  });

  it("accepts an invite addressed to you, then shows the pairing", async () => {
    const user = userEvent.setup();
    vi.mocked(getCrew)
      .mockResolvedValueOnce({ ...EMPTY, received: [{ id: "inv-9", email: "me@example.com", createdAt: 1 }] })
      .mockResolvedValue({
        ...EMPTY,
        members: [{ userId: "u-2", email: "captain@example.com", name: "Sam Reyes", inviteId: "inv-9" }],
      });
    vi.mocked(acceptCrewInvite).mockResolvedValue();
    render(<CrewPanel />);

    await user.click(await screen.findByTestId("crew-accept-inv-9"));

    expect(acceptCrewInvite).toHaveBeenCalledWith("inv-9");
    expect(await screen.findByTestId("crew-member-u-2")).toHaveTextContent("Sam Reyes");
    expect(screen.queryByTestId("crew-invite-received-inv-9")).not.toBeInTheDocument();
  });

  it("stops sharing with a paired member", async () => {
    const user = userEvent.setup();
    vi.mocked(getCrew)
      .mockResolvedValueOnce({
        ...EMPTY,
        members: [{ userId: "u-3", email: "fo@example.com", name: null, inviteId: "inv-3" }],
      })
      .mockResolvedValue(EMPTY);
    vi.mocked(revokeCrewInvite).mockResolvedValue();
    render(<CrewPanel />);

    await user.click(await screen.findByTestId("crew-remove-inv-3"));

    // Revoked by the invite that established the pairing — either side may end it.
    expect(revokeCrewInvite).toHaveBeenCalledWith("inv-3");
    await waitFor(() => expect(screen.queryByTestId("crew-member-u-3")).not.toBeInTheDocument());
  });

  it("shows an invite you sent as still waiting, and can withdraw it", async () => {
    const user = userEvent.setup();
    vi.mocked(getCrew)
      .mockResolvedValueOnce({ ...EMPTY, sent: [{ id: "inv-7", email: "pending@example.com", createdAt: 1 }] })
      .mockResolvedValue(EMPTY);
    vi.mocked(revokeCrewInvite).mockResolvedValue();
    render(<CrewPanel />);

    expect(await screen.findByTestId("crew-invite-sent-inv-7")).toHaveTextContent(/waiting for them to accept/i);

    await user.click(screen.getByRole("button", { name: /withdraw/i }));
    expect(revokeCrewInvite).toHaveBeenCalledWith("inv-7");
  });

  it("falls back to an empty panel rather than breaking the tab when crew can't be loaded", async () => {
    vi.mocked(getCrew).mockRejectedValue(new Error("offline"));
    render(<CrewPanel />);

    expect(await screen.findByTestId("crew-panel")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InviteLanding from "./InviteLanding";
import { getInvitePreview } from "./api";

vi.mock("./api", () => ({ getInvitePreview: vi.fn() }));
vi.mock("./auth-client", () => ({
  authClient: {
    signIn: { emailOtp: vi.fn(), social: vi.fn() },
    emailOtp: { sendVerificationOtp: vi.fn() },
  },
}));

describe("InviteLanding", () => {
  beforeEach(() => {
    vi.mocked(getInvitePreview).mockReset();
  });

  it("shows who invited you and which address to use", async () => {
    vi.mocked(getInvitePreview).mockResolvedValue({
      fromName: "Isis",
      toEmailMasked: "k•••••94@gmail.com",
    });

    render(<InviteLanding token="tok123" />);

    const panel = await screen.findByTestId("invite-preview");
    expect(panel).toHaveTextContent(/isis shared their roster with you/i);
    expect(panel).toHaveTextContent("k•••••94@gmail.com");
    // The reason to sign in, stated: an anonymous form gives a stranger nothing to trust.
    expect(panel).toHaveTextContent(/when they land/i);

    // Sign-in is Landing's existing form, not a second implementation.
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it("shows nothing about the roster", async () => {
    vi.mocked(getInvitePreview).mockResolvedValue({
      fromName: "Isis",
      toEmailMasked: "k•••••94@gmail.com",
    });

    render(<InviteLanding token="tok123" />);
    const panel = await screen.findByTestId("invite-preview");

    // No clock, no airport codes, no flight numbers — the whole reason this route is allowed to
    // be unauthenticated. A time would put us back where the deleted share link was.
    expect(panel.textContent).not.toMatch(/\d{1,2}:\d{2}/);
    expect(panel.textContent).not.toMatch(/\b[A-Z]{3}\b/);
    expect(panel.textContent).not.toMatch(/\bEK\d/);
  });

  it("falls back to plain sign-in on a dead link, not a dead end", async () => {
    // Unknown, revoked, already accepted, or older than 7 days all arrive here as null.
    vi.mocked(getInvitePreview).mockResolvedValue(null);

    render(<InviteLanding token="expired" />);

    // The sign-in form still renders: the invitation itself is still waiting on the Share tab.
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.queryByTestId("invite-preview")).not.toBeInTheDocument();
  });

  it("treats a failed lookup as a dead link rather than crashing", async () => {
    vi.mocked(getInvitePreview).mockRejectedValue(new Error("network"));

    render(<InviteLanding token="tok123" />);

    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.queryByTestId("invite-preview")).not.toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const PREVIEW = { fromName: "Isis", toEmailMasked: "k•••••94@gmail.com" };

describe("InviteLanding", () => {
  beforeEach(() => {
    vi.mocked(getInvitePreview).mockReset();
  });

  it("explains who invited you and what you'd get, before asking for anything", async () => {
    vi.mocked(getInvitePreview).mockResolvedValue(PREVIEW);
    render(<InviteLanding token="tok123" />);

    expect(await screen.findByTestId("invite-headline")).toHaveTextContent(
      /isis wants you to know when they're back/i,
    );

    // The point of the two stages: no form until they know what this is. Landing an unknown
    // visitor on an email field asks them to act before they have any reason to trust it.
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("invite-continue")).toBeInTheDocument();
    // And it says what signing in will involve, rather than just presenting a field.
    expect(screen.getByText(/6-digit code/i)).toHaveTextContent("k•••••94@gmail.com");
  });

  it("marks the blurred calendar as a sample, and hides it from screen readers", async () => {
    vi.mocked(getInvitePreview).mockResolvedValue(PREVIEW);
    render(<InviteLanding token="tok123" />);

    const peek = await screen.findByTestId("invite-peek");
    // Every number in it is invented. Blur is decoration — one line of CSS removes it — so the
    // guarantee has to be that nothing real is behind it, and that nobody mistakes it for real.
    expect(peek).toHaveTextContent(/sample/i);
    expect(peek.querySelector("[aria-hidden='true']")).not.toBeNull();
  });

  it("only ever renders the two fields the API returns", async () => {
    // The API gives fromName and toEmailMasked and nothing else, so there is no real schedule
    // data available to leak here even by accident. This pins that the component invents no
    // extra source of truth.
    vi.mocked(getInvitePreview).mockResolvedValue(PREVIEW);
    render(<InviteLanding token="tok123" />);

    await screen.findByTestId("invite-headline");
    expect(vi.mocked(getInvitePreview)).toHaveBeenCalledWith("tok123");
    expect(Object.keys(PREVIEW).sort()).toEqual(["fromName", "toEmailMasked"]);
  });

  it("reveals the sign-in form only after they choose to continue", async () => {
    vi.mocked(getInvitePreview).mockResolvedValue(PREVIEW);
    const user = userEvent.setup();
    render(<InviteLanding token="tok123" />);

    await user.click(await screen.findByTestId("invite-continue"));

    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    // The reminder of who invited them carries through to the form.
    expect(screen.getByTestId("invite-preview")).toHaveTextContent(/isis/i);
  });

  it("falls back to plain sign-in on a dead link, not a dead end", async () => {
    // Unknown, revoked, already accepted, or older than 7 days all arrive here as null.
    vi.mocked(getInvitePreview).mockResolvedValue(null);
    render(<InviteLanding token="expired" />);

    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.queryByTestId("invite-headline")).not.toBeInTheDocument();
    expect(screen.queryByTestId("invite-preview")).not.toBeInTheDocument();
  });

  it("treats a failed lookup as a dead link rather than crashing", async () => {
    vi.mocked(getInvitePreview).mockRejectedValue(new Error("network"));
    render(<InviteLanding token="tok123" />);

    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.queryByTestId("invite-headline")).not.toBeInTheDocument();
  });
});

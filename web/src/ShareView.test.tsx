import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShareLink } from "@roaster/shared";
import ShareView from "./ShareView";
import { createShareLink, getShareLinks, revokeShareLink } from "./api";

vi.mock("./api", () => ({
  createShareLink: vi.fn(),
  getShareLinks: vi.fn(),
  revokeShareLink: vi.fn(),
  // The crew panel shares this tab; these keep it rendered but empty. CrewPanel's own
  // behaviour is covered in CrewPanel.test.tsx.
  getCrew: vi.fn().mockResolvedValue({ members: [], sent: [], received: [] }),
  inviteCrew: vi.fn(),
  acceptCrewInvite: vi.fn(),
  revokeCrewInvite: vi.fn(),
}));

const momLink: ShareLink = {
  id: "link-1",
  token: "tok-abc123",
  label: "For Mom",
  createdAt: new Date("2026-08-01T00:00:00.000Z").getTime(),
  revoked: false,
};

describe("ShareView", () => {
  beforeEach(() => {
    vi.stubGlobal("location", { origin: "https://danyeowa.example" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("shows an empty state with a create-link CTA when there are no links", async () => {
    vi.mocked(getShareLinks).mockResolvedValue([]);

    render(<ShareView />);

    expect(await screen.findByTestId("create-link")).toBeInTheDocument();
    expect(screen.getByText(/family opens the link/i)).toBeInTheDocument();
  });

  it("creates a link with an optional label and shows it in the list", async () => {
    vi.mocked(getShareLinks).mockResolvedValue([]);
    vi.mocked(createShareLink).mockResolvedValue(momLink);
    const user = userEvent.setup();

    render(<ShareView />);

    await user.click(await screen.findByTestId("create-link"));
    await user.type(screen.getByLabelText(/label/i), "For Mom");
    await user.click(screen.getByTestId("confirm-create-link"));

    expect(createShareLink).toHaveBeenCalledWith("For Mom");
    expect(await screen.findByTestId("link-row")).toHaveTextContent("For Mom");
  });

  it("copies the correct share URL to the clipboard and shows transient confirmation", async () => {
    vi.mocked(getShareLinks).mockResolvedValue([momLink]);
    // userEvent.setup() must run BEFORE stubbing navigator: it attaches its own clipboard
    // stub onto whatever `navigator` is current at setup time, so stubbing first would let
    // that internal attach silently clobber our writeText mock.
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    render(<ShareView />);

    await user.click(await screen.findByTestId("copy-link"));

    expect(writeText).toHaveBeenCalledWith("https://danyeowa.example/share/tok-abc123");
    expect(await screen.findByTestId("copy-link")).toHaveTextContent(/copied/i);
  });

  it("uses navigator.share when available", async () => {
    vi.mocked(getShareLinks).mockResolvedValue([momLink]);
    const user = userEvent.setup();
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText } });

    render(<ShareView />);

    await user.click(await screen.findByTestId("share-link"));

    expect(share).toHaveBeenCalledWith({ url: "https://danyeowa.example/share/tok-abc123" });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to clipboard copy when navigator.share is unavailable", async () => {
    vi.mocked(getShareLinks).mockResolvedValue([momLink]);
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    render(<ShareView />);

    await user.click(await screen.findByTestId("share-link"));

    expect(writeText).toHaveBeenCalledWith("https://danyeowa.example/share/tok-abc123");
  });

  it("revokes a link after inline confirmation and shows revoked state", async () => {
    vi.mocked(getShareLinks).mockResolvedValue([momLink]);
    vi.mocked(revokeShareLink).mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<ShareView />);

    await user.click(await screen.findByTestId("revoke-link"));
    expect(screen.getByTestId("confirm-revoke")).toBeInTheDocument();

    await user.click(screen.getByTestId("confirm-revoke"));

    expect(revokeShareLink).toHaveBeenCalledWith("link-1");
    await waitFor(() => expect(screen.getByTestId("link-row")).toHaveTextContent(/revoked/i));
    expect(screen.queryByTestId("copy-link")).not.toBeInTheDocument();
    expect(screen.queryByTestId("revoke-link")).not.toBeInTheDocument();
  });

  it("does not revoke without confirmation", async () => {
    vi.mocked(getShareLinks).mockResolvedValue([momLink]);
    const user = userEvent.setup();

    render(<ShareView />);

    await user.click(await screen.findByTestId("revoke-link"));
    await user.click(screen.getByText(/cancel/i));

    expect(revokeShareLink).not.toHaveBeenCalled();
    expect(screen.getByTestId("copy-link")).toBeInTheDocument();
  });

  it("renders revoked links as struck-through with a revoked tag and no actions", async () => {
    vi.mocked(getShareLinks).mockResolvedValue([{ ...momLink, revoked: true }]);

    render(<ShareView />);

    const row = await screen.findByTestId("link-row");
    expect(row).toHaveTextContent(/revoked/i);
    expect(screen.queryByTestId("copy-link")).not.toBeInTheDocument();
    expect(screen.queryByTestId("revoke-link")).not.toBeInTheDocument();
  });
});

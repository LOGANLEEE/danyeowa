import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InstallBanner from "./InstallBanner";
import * as install from "./lib/install";

function mockInstallState(state: {
  available?: boolean;
  standalone?: boolean;
  ios?: boolean;
  accepted?: boolean;
}) {
  vi.spyOn(install, "isInstallPromptAvailable").mockReturnValue(state.available ?? false);
  vi.spyOn(install, "isRunningStandalone").mockReturnValue(state.standalone ?? false);
  vi.spyOn(install, "isIos").mockReturnValue(state.ios ?? false);
  vi.spyOn(install, "onInstallPromptAvailable").mockReturnValue(() => {});
  return vi.spyOn(install, "showInstallPrompt").mockResolvedValue(state.accepted ?? false);
}

describe("InstallBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("offers a one-tap install when the browser has an install prompt ready", async () => {
    const user = userEvent.setup();
    const prompt = mockInstallState({ available: true, accepted: true });

    render(<InstallBanner />);
    await user.click(screen.getByTestId("install-banner-install"));

    expect(prompt).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("install-banner")).not.toBeInTheDocument();
  });

  it("hides itself when the prompt is declined, since the prompt is single-use", async () => {
    const user = userEvent.setup();
    mockInstallState({ available: true, accepted: false });

    render(<InstallBanner />);
    await user.click(screen.getByTestId("install-banner-install"));

    expect(screen.queryByTestId("install-banner")).not.toBeInTheDocument();
  });

  it("stays hidden when already running as an installed app", () => {
    mockInstallState({ available: true, standalone: true });

    render(<InstallBanner />);
    expect(screen.queryByTestId("install-banner")).not.toBeInTheDocument();
  });

  it("shows the manual Add to Home Screen hint on iOS, where no install prompt exists", () => {
    mockInstallState({ available: false, ios: true });

    render(<InstallBanner />);
    expect(screen.getByTestId("install-banner")).toHaveTextContent(/add to home screen/i);
    expect(screen.queryByTestId("install-banner-install")).not.toBeInTheDocument();
  });

  it("stays hidden on a browser that cannot install at all", () => {
    mockInstallState({ available: false, ios: false });

    render(<InstallBanner />);
    expect(screen.queryByTestId("install-banner")).not.toBeInTheDocument();
  });

  it("does not come back after being dismissed", async () => {
    const user = userEvent.setup();
    mockInstallState({ available: true });

    const { unmount } = render(<InstallBanner />);
    await user.click(screen.getByTestId("install-banner-dismiss"));
    expect(screen.queryByTestId("install-banner")).not.toBeInTheDocument();

    unmount();
    render(<InstallBanner />);
    expect(screen.queryByTestId("install-banner")).not.toBeInTheDocument();
  });
});

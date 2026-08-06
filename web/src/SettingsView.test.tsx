import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsView from "./SettingsView";
import * as theme from "./theme";

describe("SettingsView", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows the signed-in user's email", () => {
    render(<SettingsView email="pilot@example.com" onSignOut={vi.fn()} />);
    expect(screen.getByText("pilot@example.com")).toBeInTheDocument();
  });

  it("shows the home base row as a read-only note", () => {
    render(<SettingsView email="pilot@example.com" onSignOut={vi.fn()} />);
    expect(screen.getByText(/DXB/)).toBeInTheDocument();
    expect(screen.getByText(/customizable later/i)).toBeInTheDocument();
  });

  it("reflects the current theme selection, defaulting to System", () => {
    render(<SettingsView email="pilot@example.com" onSignOut={vi.fn()} />);
    expect(screen.getByRole("radio", { name: /system/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /^light$/i })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /^dark$/i })).not.toBeChecked();
  });

  it("calls setTheme when a theme radio is picked", async () => {
    const setThemeSpy = vi.spyOn(theme, "setTheme");
    const user = userEvent.setup();
    render(<SettingsView email="pilot@example.com" onSignOut={vi.fn()} />);

    await user.click(screen.getByRole("radio", { name: /^dark$/i }));
    expect(setThemeSpy).toHaveBeenCalledWith("dark");

    setThemeSpy.mockRestore();
  });

  it("calls onSignOut when the sign-out button is clicked", async () => {
    const onSignOut = vi.fn();
    const user = userEvent.setup();
    render(<SettingsView email="pilot@example.com" onSignOut={onSignOut} />);

    await user.click(screen.getByRole("button", { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});

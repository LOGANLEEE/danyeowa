import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TabBar from "./TabBar";

describe("TabBar", () => {
  it("renders all five tabs", () => {
    render(<TabBar active="calendar" onSelect={vi.fn()} onAdd={vi.fn()} />);

    expect(screen.getByTestId("tab-calendar")).toBeInTheDocument();
    expect(screen.getByTestId("tab-trips")).toBeInTheDocument();
    expect(screen.getByTestId("tab-add")).toBeInTheDocument();
    expect(screen.getByTestId("tab-share")).toBeInTheDocument();
    expect(screen.getByTestId("tab-settings")).toBeInTheDocument();
  });

  it("marks the active tab with accent styling", () => {
    render(<TabBar active="trips" onSelect={vi.fn()} onAdd={vi.fn()} />);

    expect(screen.getByTestId("tab-trips").className).toContain("text-accent");
    expect(screen.getByTestId("tab-calendar").className).not.toContain("text-accent");
  });

  it("calls onSelect with the tab name when a non-add tab is clicked", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<TabBar active="calendar" onSelect={onSelect} onAdd={vi.fn()} />);

    await user.click(screen.getByTestId("tab-trips"));
    expect(onSelect).toHaveBeenCalledWith("trips");

    await user.click(screen.getByTestId("tab-share"));
    expect(onSelect).toHaveBeenCalledWith("share");

    await user.click(screen.getByTestId("tab-settings"));
    expect(onSelect).toHaveBeenCalledWith("settings");
  });

  it("calls onAdd (not onSelect) when the center add button is clicked", async () => {
    const onSelect = vi.fn();
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<TabBar active="calendar" onSelect={onSelect} onAdd={onAdd} />);

    await user.click(screen.getByTestId("tab-add"));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

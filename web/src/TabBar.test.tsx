import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TabBar from "./TabBar";

describe("TabBar", () => {
  it("renders the four controls, and no Trips tab", () => {
    render(<TabBar active="calendar" onSelect={vi.fn()} onAdd={vi.fn()} />);

    expect(screen.getByTestId("tab-calendar")).toBeInTheDocument();
    expect(screen.getByTestId("tab-add")).toBeInTheDocument();
    expect(screen.getByTestId("tab-share")).toBeInTheDocument();
    expect(screen.getByTestId("tab-settings")).toBeInTheDocument();
    // The Trips tab listed the same duties the calendar already shows; it was deleted along
    // with the full-screen trip detail it was the only way into.
    expect(screen.queryByTestId("tab-trips")).not.toBeInTheDocument();
  });

  it("is pinned to the viewport bottom (fixed, not an in-flow flex child)", () => {
    render(<TabBar active="calendar" onSelect={vi.fn()} onAdd={vi.fn()} />);

    const nav = screen.getByTestId("tab-calendar").closest("nav");
    expect(nav).not.toBeNull();
    expect(nav!.className).toContain("fixed");
    expect(nav!.className).toContain("bottom-0");
  });

  it("marks the active tab with accent styling", () => {
    render(<TabBar active="share" onSelect={vi.fn()} onAdd={vi.fn()} />);

    expect(screen.getByTestId("tab-share").className).toContain("text-accent");
    expect(screen.getByTestId("tab-calendar").className).not.toContain("text-accent");
  });

  it("calls onSelect with the tab name when a non-add tab is clicked", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<TabBar active="calendar" onSelect={onSelect} onAdd={vi.fn()} />);

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

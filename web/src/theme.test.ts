import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, getStoredTheme, setTheme } from "./theme";

describe("theme store", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to system when nothing is stored", () => {
    expect(getStoredTheme()).toBe("system");
  });

  it("defaults to system when the stored value is invalid", () => {
    localStorage.setItem("roster-theme", "garbage");
    expect(getStoredTheme()).toBe("system");
  });

  it("reads back a persisted light/dark override", () => {
    localStorage.setItem("roster-theme", "dark");
    expect(getStoredTheme()).toBe("dark");
  });

  it("falls back to system when localStorage.getItem throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getStoredTheme()).toBe("system");
    spy.mockRestore();
  });

  describe("applyTheme", () => {
    it("removes data-theme for system", () => {
      document.documentElement.setAttribute("data-theme", "dark");
      applyTheme("system");
      expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    });

    it("sets data-theme=light", () => {
      applyTheme("light");
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });

    it("sets data-theme=dark", () => {
      applyTheme("dark");
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });
  });

  describe("setTheme", () => {
    it("persists the choice and applies it", () => {
      setTheme("dark");
      expect(localStorage.getItem("roster-theme")).toBe("dark");
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("still applies the theme when localStorage.setItem throws", () => {
      const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      setTheme("light");
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
      spy.mockRestore();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

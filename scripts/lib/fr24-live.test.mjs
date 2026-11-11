import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Reading the user's real Chrome profile needs Full Disk Access, which the launchd jobs do not
 * have: every harvest run died with EPERM copying its Cookies file. The jobs now keep their own
 * profile, signed in once with chrome-login.mjs.
 */
const REAL_CHROME = path.join(os.homedir(), "Library/Application Support/Google/Chrome");
const SCRIPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = (prefix) => mkdtempSync(path.join(os.tmpdir(), prefix));

describe("harvestChromeProfileDir", () => {
  afterEach(() => {
    vi.doUnmock("node:fs");
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("never touches the user's real Chrome profile", async () => {
    const touched = [];
    vi.doMock("node:fs", async (importOriginal) => {
      const fs = await importOriginal();
      const wrapped = {};
      for (const name of ["existsSync", "copyFileSync", "readFileSync", "mkdirSync", "rmSync", "statSync"]) {
        wrapped[name] = (...args) => {
          touched.push(...args.filter((a) => typeof a === "string"));
          return fs[name](...args);
        };
      }
      return { ...fs, ...wrapped, default: { ...fs, ...wrapped } };
    });
    const live = await import("./fr24-live.mjs");
    live.harvestChromeProfileDir({ DANYEOWA_CHROME_PROFILE_DIR: tempDir("danyeowa-profile-") });

    expect(touched.filter((p) => p.startsWith(REAL_CHROME))).toEqual([]);
  });

  it("defaults to ~/.local/share/danyeowa/chrome-profile", async () => {
    const fakeHome = tempDir("danyeowa-home-");
    vi.spyOn(os, "homedir").mockReturnValue(fakeHome);
    const { harvestChromeProfileDir } = await import("./fr24-live.mjs");

    const dir = harvestChromeProfileDir({});
    expect(dir).toBe(path.join(fakeHome, ".local/share/danyeowa/chrome-profile"));
    expect(existsSync(dir)).toBe(true);
  });

  it("keeps an existing sign-in: files already in the profile survive", async () => {
    const dir = tempDir("danyeowa-profile-");
    writeFileSync(path.join(dir, "Cookies"), "session");
    const { harvestChromeProfileDir } = await import("./fr24-live.mjs");

    expect(harvestChromeProfileDir({ DANYEOWA_CHROME_PROFILE_DIR: dir })).toBe(dir);
    expect(readFileSync(path.join(dir, "Cookies"), "utf8")).toBe("session");
  });

  it("no fr24 script points at the real profile or still borrows from it", () => {
    for (const file of ["fetch-schedules.mjs", "refresh-arrivals.mjs", "chrome-login.mjs", "lib/fr24-live.mjs"]) {
      const full = path.join(SCRIPTS, file);
      expect(existsSync(full), file).toBe(true);
      const src = readFileSync(full, "utf8");
      expect(src, file).not.toContain("Application Support/Google/Chrome");
      expect(src, file).not.toContain("borrowChromeProfile");
    }
  });
});

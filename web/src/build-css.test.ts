/// <reference types="node" />
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distAssets = join(webRoot, "dist", "assets");

/** Finds the built CSS file, building the app first if dist/assets isn't there yet. */
function readBuiltCss(): string {
  if (!existsSync(distAssets)) {
    execFileSync("npx", ["vite", "build"], { cwd: webRoot, stdio: "inherit" });
  }
  const cssFile = readdirSync(distAssets).find((f: string) => f.endsWith(".css"));
  if (!cssFile) throw new Error("no CSS file found in dist/assets after build");
  return readFileSync(join(distAssets, cssFile), "utf-8");
}

describe("built CSS", () => {
  it("contains the reduced-motion media block", () => {
    const css = readBuiltCss();
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it("contains both dark-theme override mechanisms", () => {
    const css = readBuiltCss();
    // Mechanism 1: prefers-color-scheme, gated to when no explicit data-theme is set.
    expect(css).toMatch(/prefers-color-scheme:\s*dark/);
    // Mechanism 2: explicit manual override via data-theme, in both directions.
    expect(css).toMatch(/\[data-theme=(?:"|')?dark(?:"|')?\]/);
    expect(css).toMatch(/\[data-theme=(?:"|')?light(?:"|')?\]/);
  });
});

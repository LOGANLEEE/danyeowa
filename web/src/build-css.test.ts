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
});

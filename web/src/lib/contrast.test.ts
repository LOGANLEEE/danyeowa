/// <reference types="node" />
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrastRatio, relativeLuminance } from "./contrast";

// Same resolution the existing build-css test uses — jsdom does not always hand back a
// file: URL from a bare `new URL(..., import.meta.url)`.
const TOKENS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "tokens.css"), "utf8");

/**
 * The lightest stop of each weather sky, read out of tokens.css rather than restated here.
 *
 * Reading the real file is the point: a copy would keep passing after someone lightened a
 * gradient, which is exactly the change that breaks this. The lightest stop is the worst case
 * — text on a vertical gradient is hardest to read where the field is palest.
 */
function lightestSkyStops(): Record<string, string> {
  const stops: Record<string, string> = {};
  for (const match of TOKENS.matchAll(/\.sky\[data-sky="(\w+)"\]\s*\{([\s\S]*?)\}/g)) {
    const [, kind, block] = match;
    const hexes = [...block!.matchAll(/#([0-9a-f]{6})\b/gi)].map((m) => `#${m[1]}`);
    expect(hexes.length, `${kind} should declare gradient stops`).toBeGreaterThan(0);
    // Lightest by relative luminance, not by source order.
    stops[kind!] = hexes.reduce((a, b) => (relativeLuminance(a) >= relativeLuminance(b) ? a : b));
  }
  return stops;
}

function token(name: string): string {
  const found = TOKENS.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{3,6})`, "i"));
  expect(found, `--color-${name} should be defined in tokens.css`).not.toBeNull();
  return found![1]!;
}

describe("contrastRatio", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // Order must not matter.
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#767676"),
      10,
    );
  });

  it("refuses a value it cannot read rather than scoring it as black", () => {
    expect(() => relativeLuminance("rgb(0,0,0)")).toThrow();
    expect(() => relativeLuminance("#12345")).toThrow();
  });
});

describe("weather skies clear the 4.5:1 floor", () => {
  const skies = lightestSkyStops();
  const inkOnSky = token("ink-on-sky");
  const mutedOnSky = token("ink-muted-on-sky");
  const reportOnSky = token("report-on-sky");

  it("covers every sky declared in tokens.css", () => {
    expect(Object.keys(skies).sort()).toEqual(["clear", "cloud", "rain", "snow", "storm"]);
  });

  for (const [kind, stop] of Object.entries(skies)) {
    it(`${kind}: body, muted and report text all pass on ${stop}`, () => {
      expect(contrastRatio(inkOnSky, stop)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(mutedOnSky, stop)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(reportOnSky, stop)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("is the reason the ordinary muted token is not reused", () => {
    // The measurement that killed the first attempt. If this ever passes, the skies have been
    // darkened enough that --color-ink-muted could be used directly and the extra token
    // dropped — which is a real simplification, not a failure.
    const worst = Object.values(skies).reduce((a, b) =>
      relativeLuminance(a) >= relativeLuminance(b) ? a : b,
    );
    expect(contrastRatio("#8b93a3", worst)).toBeLessThan(4.5);
  });
});

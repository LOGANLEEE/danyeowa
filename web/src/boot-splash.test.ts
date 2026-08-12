import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = dirname(fileURLToPath(import.meta.url));

/** index.html's boot splash paints before tokens.css exists, so it hard-codes the token values
 * instead of referencing them. That copy can silently drift the day someone retunes a colour —
 * this is the check that fails when it does. */
const html = readFileSync(join(srcRoot, "..", "index.html"), "utf8");
const tokens = readFileSync(join(srcRoot, "tokens.css"), "utf8");

/** Pulls `--name: value;` pairs out of the first block whose header matches `selector`. */
function varsIn(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  expect(start, `block not found: ${selector}`).toBeGreaterThanOrEqual(0);
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

const PAIRS = [
  ["bp-ground", "color-ground"],
  ["bp-card", "color-card"],
  ["bp-ink", "color-ink"],
  ["bp-muted", "color-ink-muted"],
  ["bp-edge", "color-edge"],
  ["bp-accent", "color-accent"],
] as const;

describe("boot splash", () => {
  it.each([
    ["light", "#boot-splash {", "@theme {"],
    ["dark", ':root[data-theme="dark"] #boot-splash {', ':root[data-theme="dark"] {'],
  ])("uses the real %s token values", (_theme, splashSelector, tokenSelector) => {
    const splash = varsIn(html, splashSelector);
    const real = varsIn(tokens, tokenSelector);
    for (const [bpVar, tokenVar] of PAIRS) {
      expect(splash[bpVar], bpVar).toBe(real[tokenVar]);
    }
  });

  // The splash is dismissed by CSS alone: App renders null until /api/me answers, so #root stays
  // empty and this rule is the only thing standing between a loaded app and a stuck splash.
  it("is dismissed by #root:not(:empty), and sits outside #root so React can't clear it early", () => {
    expect(html).toMatch(/#root:not\(:empty\)\s*\+\s*#boot-splash/);
    expect(html).toMatch(/<div id="root"><\/div>/);
    expect(html.indexOf('id="boot-splash"')).toBeGreaterThan(html.indexOf('id="root"'));
  });
});

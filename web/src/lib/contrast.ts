/**
 * WCAG 2.1 relative luminance and contrast ratio.
 *
 * Exists so the weather skies are *measured* rather than eyeballed. The first sky mock put
 * `--color-ink-muted` (#8b93a3) on the lightest stop of the storm field (#262b3a) and it came
 * out at 4.4:1 — under the 4.5 floor, and completely invisible by eye. Contrast is the one
 * thing a background this project paints has to prove, so the proof lives in a test.
 */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** `#rgb` or `#rrggbb`. Throws on anything else — a silent 0 would read as pure black and
 * make every ratio look wonderful. */
export function relativeLuminance(hex: string): number {
  const raw = hex.trim().replace(/^#/, "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`not a hex colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(full.slice(i, i + 2), 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Symmetric contrast ratio, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

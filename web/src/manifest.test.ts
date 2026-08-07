import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("PWA manifest wiring", () => {
  it("index.html links the manifest and an apple-touch-icon", () => {
    const html = readFileSync(join(webRoot, "index.html"), "utf-8");
    expect(html).toMatch(/<link\s+rel="manifest"\s+href="\/manifest\.webmanifest"\s*\/>/);
    expect(html).toMatch(/<link\s+rel="apple-touch-icon"\s+href="\/icons\/apple-touch-icon\.png"\s*\/>/);
  });

  it("manifest.webmanifest declares name, standalone display, colors, and icons", () => {
    const manifest = JSON.parse(
      readFileSync(join(webRoot, "public", "manifest.webmanifest"), "utf-8"),
    );
    expect(manifest.name).toBe("Roaster Me");
    expect(manifest.short_name).toBe("Roaster");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.background_color).toBe("#15171c");
    expect(manifest.theme_color).toBe("#2f6fed");

    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable")).toBe(
      true,
    );

    for (const icon of manifest.icons as { src: string }[]) {
      const iconPath = join(webRoot, "public", icon.src);
      expect(existsSync(iconPath), `missing icon file: ${icon.src}`).toBe(true);
    }
  });
});

#!/usr/bin/env node
// Generates the PWA icon set (192, 512, maskable-512, apple-touch-180) from a single
// hand-written SVG source, matching the app's visual identity (ground #15171c bg,
// accent #2f6fed calendar glyph, amber #ffd57e day square — see index.html's inline
// favicon SVG for the same motif at smaller scale).
//
// Run: node scripts/generate-icons.mjs
// Output: web/public/icons/*.png (committed — sharp itself stays a devDependency,
// nothing at runtime depends on it).
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(repoRoot, "web", "public", "icons");

// sharp is a devDependency of web/, not of this script's own package (repo root has
// none). Resolve it relative to web/package.json so this script can live at the repo
// root (alongside the other one-off scripts/*.mjs) without needing its own package.json.
const sharp = createRequire(join(repoRoot, "web", "package.json"))("sharp");

const GROUND = "#15171c";
const ACCENT = "#2f6fed";
const AMBER = "#ffd57e";

/** Base icon: rounded-square ground, calendar glyph with two header dots and one
 * amber "day" square — same motif as index.html's inline favicon, scaled up. */
function iconSvg({ maskable }) {
  // Maskable icons need extra safe-area padding (~10% margin) so Android's
  // adaptive-icon mask doesn't clip the glyph.
  const pad = maskable ? 90 : 0;
  const size = 512;
  const inner = size - pad * 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${GROUND}"/>
  <g transform="translate(${pad}, ${pad})">
    <rect x="0" y="0" width="${inner}" height="${inner}" rx="${inner * 0.22}" fill="${GROUND}"/>
    <rect x="${inner * 0.16}" y="${inner * 0.22}" width="${inner * 0.68}" height="${inner * 0.56}" rx="${inner * 0.08}" fill="${ACCENT}"/>
    <circle cx="${inner * 0.32}" cy="${inner * 0.34}" r="${inner * 0.035}" fill="${GROUND}"/>
    <circle cx="${inner * 0.68}" cy="${inner * 0.34}" r="${inner * 0.035}" fill="${GROUND}"/>
    <rect x="${inner * 0.58}" y="${inner * 0.5}" width="${inner * 0.16}" height="${inner * 0.16}" rx="${inner * 0.03}" fill="${AMBER}"/>
  </g>
</svg>`;
}

const targets = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-maskable-512.png", size: 512, maskable: true },
  { file: "apple-touch-icon.png", size: 180, maskable: false },
];

async function main() {
  mkdirSync(outDir, { recursive: true });

  for (const { file, size, maskable } of targets) {
    const svg = iconSvg({ maskable });
    const png = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
    writeFileSync(join(outDir, file), png);
    console.log(`wrote web/public/icons/${file} (${size}x${size}${maskable ? ", maskable" : ""})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

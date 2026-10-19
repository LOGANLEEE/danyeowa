/// <reference types="node" />
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";

const TOKENS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "tokens.css"), "utf8");

// The light values live twice: the @theme defaults and the explicit data-theme="light" block.
const LIGHT_BLOCKS = ["@theme", ':root[data-theme="light"]'];

function lightToken(selector: string, name: string): string {
  const start = TOKENS.indexOf(`${selector} {`);
  expect(start, `${selector} block should exist`).toBeGreaterThanOrEqual(0);
  const block = TOKENS.slice(start, TOKENS.indexOf("\n}", start));
  const found = block.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i"));
  expect(found, `--color-${name} should be set in ${selector}`).not.toBeNull();
  return found![1]!;
}

// Every light surface a coloured text can sit on.
const SURFACES = ["ground", "card", "raised"];

describe("light theme: filled buttons and today cell carry text-ground at 4.5:1", () => {
  for (const selector of LIGHT_BLOCKS) {
    for (const fill of ["accent", "danger", "today"]) {
      it(`${fill} in ${selector}`, () => {
        expect(
          contrastRatio(lightToken(selector, "ground"), lightToken(selector, fill)),
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe("light theme: accent and danger used as text clear 4.5:1 on every surface", () => {
  for (const selector of LIGHT_BLOCKS) {
    for (const ink of ["accent", "danger"]) {
      for (const surface of [...SURFACES, ...(ink === "accent" ? ["accent-soft"] : [])]) {
        it(`${ink} on ${surface} in ${selector}`, () => {
          expect(
            contrastRatio(lightToken(selector, ink), lightToken(selector, surface)),
          ).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});

#!/usr/bin/env node
/**
 * One-off: sign in to flightradar24 in the harvest Chrome profile (see harvestChromeProfileDir).
 * Same launch options as the harvest jobs, so the cookies written here are readable by them.
 */
import { chromium } from "@playwright/test";
import { FR24_LAUNCH_OPTIONS, harvestChromeProfileDir } from "./lib/fr24-live.mjs";

const dir = harvestChromeProfileDir();
const ctx = await chromium.launchPersistentContext(dir, { ...FR24_LAUNCH_OPTIONS, headless: false });
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, "webdriver", { get: () => undefined });
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto("https://www.flightradar24.com/");
console.log(`Sign in to flightradar24 in the window that opened, then quit Chrome (Cmd+Q). Profile: ${dir}`);
await new Promise((resolve) => ctx.on("close", resolve));

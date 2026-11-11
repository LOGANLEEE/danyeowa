#!/usr/bin/env node
/**
 * One-off: sign in to flightradar24 in each job's Chrome profile (see harvestChromeProfileDir).
 * Same launch options as the jobs, so the cookies written here are readable by them.
 */
import { chromium } from "@playwright/test";
import { FR24_LAUNCH_OPTIONS, harvestChromeProfileDir } from "./lib/fr24-live.mjs";

for (const job of ["fetch-schedules", "refresh-arrivals"]) {
  const dir = harvestChromeProfileDir(job);
  const ctx = await chromium.launchPersistentContext(dir, { ...FR24_LAUNCH_OPTIONS, headless: false });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto("https://www.flightradar24.com/");
  console.log(`Sign in to flightradar24 (${job}), then quit Chrome (Cmd+Q). Profile: ${dir}`);
  await new Promise((resolve) => ctx.on("close", resolve));
}

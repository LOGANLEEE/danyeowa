import { chromium } from "@playwright/test";
import os from "node:os";
import path from "node:path";
import { borrowChromeProfile, fetchLiveArrival } from "./lib/fr24-live.mjs";

// Does a borrowed-cookie profile get past the 403 that a fresh Playwright context hits?
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const scratch = path.join(os.tmpdir(), "roaster-chrome-profile");
borrowChromeProfile(scratch);

const ctx = await chromium.launchPersistentContext(scratch, {
  headless: true,
  channel: "chrome",
  userAgent: UA,
  locale: "en-GB",
  // Playwright advertises itself: navigator.webdriver and the AutomationControlled blink feature
  // are what a bot check reads first. Cookies alone did not get past the 403.
  args: ["--disable-blink-features=AutomationControlled"],
  ignoreDefaultArgs: ["--enable-automation"],
});
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, "webdriver", { get: () => undefined });
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto("https://www.flightradar24.com/", { waitUntil: "domcontentloaded", timeout: 45_000 });
await page.waitForTimeout(6000);

for (const no of ["EK4", "EK40", "EK373"]) {
  const live = await fetchLiveArrival(page, no);
  const f = (s) => (s ? new Date(s * 1000).toISOString().slice(11, 16) + "Z" : "-");
  const drift =
    live.scheduledArrival && live.liveArrival
      ? `${Math.round((live.liveArrival - live.scheduledArrival) / 60)} min`
      : "-";
  console.log(
    `${no.padEnd(6)} blocked=${!!live.blocked} airborne=${live.airborne ?? "-"} ` +
      `status="${live.statusText ?? "-"}" sched=${f(live.scheduledArrival)} live=${f(live.liveArrival)} drift=${drift}` +
      (live.reason ? ` reason=${live.reason}` : "")
  );
  await page.waitForTimeout(1200);
}

await ctx.close();

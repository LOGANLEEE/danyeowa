import { chromium, devices } from "@playwright/test";
const OUT = "/private/tmp/claude-502/-Users-loganlee-project-portfolio-roaster-me/a6a6729f-6b3e-4b2a-ac05-d86549b7c2d3/scratchpad";
const BASE = "http://localhost:8787";
const EMAIL = `film${Date.now()}@local.test`;

const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const page = await (await browser.newContext({ ...devices["iPhone 13"] })).newPage();

await page.goto(BASE + "/");
await page.getByLabel(/email/i).fill(EMAIL);
await page.getByRole("button", { name: /send code/i }).click();
const code = page.getByLabel(/code/i); await code.waitFor();
const { otp } = await (await page.request.get(`${BASE}/api/__e2e/last-otp?email=${encodeURIComponent(EMAIL)}`)).json();
await code.fill(otp);
await page.getByRole("button", { name: /^sign in$/i }).click();
await page.getByTestId("calendar-day-2026-08-10").waitFor({ timeout: 20000 });

// One single-day trip so the card has content.
const DAY = "2026-08-26";
await page.getByTestId(`calendar-day-${DAY}`).click();
await page.getByTestId("flightno-input").fill("372");
await page.getByTestId("autofill-card").waitFor({ timeout: 15000 });
await page.getByTestId("day-detail-card").getByRole("button", { name: /add to roster|adding/i }).first().click();
await page.getByTestId("delete-trip").waitFor({ timeout: 15000 });
await page.waitForTimeout(600);

await page.screenshot({ path: `${OUT}/f0-before.png` });

// Frames DURING the transition prove it animates rather than jumping.
const scrollable = await page.evaluate(() => {
  const de = document.documentElement;
  return { canScroll: de.scrollHeight - de.clientHeight, docH: de.scrollHeight, viewH: de.clientHeight };
});
console.log("scrollable px:", scrollable.canScroll, "(doc", scrollable.docH, "viewport", scrollable.viewH + ")");
await page.evaluate(() => window.scrollTo(0, 200));
console.log("scrollY reached:", await page.evaluate(() => Math.round(window.scrollY)));
for (const [i, ms] of [80, 160, 320].entries()) {
  await page.waitForTimeout(i === 0 ? 80 : 80);
  await page.screenshot({ path: `${OUT}/f${i + 1}-t${ms}.png` });
}
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/f4-settled.png` });   // viewport only: fullPage scrolls and resets

const state = await page.evaluate(() => {
  const header = [...document.querySelectorAll("p")].find((p) => /\d{4}/.test(p.textContent || "") && /August|September/.test(p.textContent || ""));
  const cell = document.querySelector('[data-testid^="calendar-day-"]');
  const wrap = cell?.closest(".grid-cols-7")?.parentElement;
  const overlay = [...document.querySelectorAll("div")].find((d) => d.className.includes?.("fixed") && d.className.includes?.("inset-0"));
  return {
    monthHeaderVisible: header ? header.getBoundingClientRect().height > 0 : false,
    monthHeaderText: header?.textContent?.trim() ?? null,
    gridWrapHeight: wrap ? Math.round(wrap.getBoundingClientRect().height) : null,
    overlayOpacity: overlay ? getComputedStyle(overlay).opacity : null,
    overlayZ: overlay ? getComputedStyle(overlay).zIndex : null,
    timeline: !!document.querySelector('[data-testid="duty-timeline"]'),
    scrollY: Math.round(window.scrollY),
  };
});
console.log(JSON.stringify(state, null, 1));
await browser.close();

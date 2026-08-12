import { chromium, devices } from "@playwright/test";
const BASE = "http://localhost:8787";
const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices["iPhone 13"] })).newPage();
await page.goto(BASE + "/");
await page.getByLabel(/email/i).fill("logan@example.com");
await page.getByRole("button", { name: /send code/i }).click();
const code = page.getByLabel(/code/i); await code.waitFor(); await code.fill("123123");
await page.getByRole("button", { name: /^sign in$/i }).click();
await page.getByTestId("calendar-day-2026-08-10").waitFor({ timeout: 15000 });
await page.getByTestId("calendar-day-2026-08-13").click();
await page.getByTestId("day-detail-card").waitFor();
await page.waitForTimeout(300);

const m = await page.evaluate(() => {
  const de = document.documentElement, b = document.body;
  const scrollers = [...document.querySelectorAll("*")].filter(el => {
    const s = getComputedStyle(el);
    return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 4;
  }).map(el => `${el.tagName.toLowerCase()}.${(el.className||"").toString().slice(0,28)} sh=${el.scrollHeight} ch=${el.clientHeight}`);
  return {
    docScrollable: de.scrollHeight - de.clientHeight,
    bodyScrollable: b.scrollHeight - b.clientHeight,
    innerScrollers: scrollers,
    scrollTopAfterTry: (window.scrollTo(0,120), Math.round(window.scrollY)),
  };
});
console.log("document scrollable px:", m.docScrollable);
console.log("body scrollable px:", m.bodyScrollable);
console.log("inner scrollers:", m.innerScrollers.length ? m.innerScrollers.join(" | ") : "none");
console.log("window.scrollY after scrollTo(0,120):", m.scrollTopAfterTry);
await browser.close();

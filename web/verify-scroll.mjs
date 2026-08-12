import { chromium, devices } from "@playwright/test";

const OUT = "/private/tmp/claude-502/-Users-loganlee-project-portfolio-roaster-me/a6a6729f-6b3e-4b2a-ac05-d86549b7c2d3/scratchpad";
const BASE = "http://localhost:8787";

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();

await page.goto(BASE + "/");
await page.getByLabel(/email/i).fill("logan@example.com");
await page.getByRole("button", { name: /send code/i }).click();
const code = page.getByLabel(/code/i);
await code.waitFor();
await code.fill("123123");
await page.getByRole("button", { name: /^sign in$/i }).click();
await page.getByTestId("calendar-day-2026-08-10").waitFor({ timeout: 15000 });

const r = await page.request.post(BASE + "/api/trips", {
  data: { legs: [
    { flightNo: "EK448", origin: "DXB", dest: "SIN", depUtc: "2026-08-13T02:15:00.000Z", arrUtc: "2026-08-13T10:40:00.000Z" },
    { flightNo: "EK448", origin: "SIN", dest: "AKL", depUtc: "2026-08-13T14:00:00.000Z", arrUtc: "2026-08-14T02:20:00.000Z" },
  ] },
});
if (!r.ok()) throw new Error(`seed ${r.status()} ${await r.text()}`);
await page.reload();
await page.getByTestId("calendar-day-2026-08-13").click();
await page.getByTestId("day-detail-card").waitFor();
await page.waitForTimeout(400);

const grid = page.getByTestId("calendar-day-2026-08-13");
const before = await grid.boundingBox();
console.log("at rest: calendar visible =", before !== null && before.height > 0);
await page.screenshot({ path: `${OUT}/v7-before-scroll.png` });

await page.evaluate(() => window.scrollTo(0, 120));
await page.waitForTimeout(700);
const after = await grid.boundingBox();
console.log("scrolled 120px: calendar height =", after ? Math.round(after.height) : 0);
await page.screenshot({ path: `${OUT}/v7-expanded.png`, fullPage: true });

await page.evaluate(() => window.scrollTo(0, 45));
await page.waitForTimeout(600);
const mid = await grid.boundingBox();
console.log("at 45px (between 30 and 60): still collapsed =", !mid || mid.height < 5);

await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(700);
const back = await grid.boundingBox();
console.log("back at top: calendar restored =", back !== null && back.height > 20);

console.log("--- expanded card ---");
console.log((await page.getByTestId("day-detail-card").innerText()).replace(/\n{2,}/g, "\n"));

const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log("horizontal overflow (want 0):", overflow);

await browser.close();
console.log("done");

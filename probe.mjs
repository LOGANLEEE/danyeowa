import { chromium, devices } from "@playwright/test";
const OUT = "/private/tmp/claude-502/-Users-loganlee-project-portfolio-roaster-me/a6a6729f-6b3e-4b2a-ac05-d86549b7c2d3/scratchpad";
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
await page.waitForTimeout(400);

// Measure the COLLAPSING WRAPPER, not a clipped descendant.
const wrapH = () => page.evaluate(() => {
  const cell = document.querySelector('[data-testid="calendar-day-2026-08-13"]');
  let el = cell;
  while (el && getComputedStyle(el).gridTemplateRows === "") el = el.parentElement;
  // walk up to the element whose computed grid-template-rows animates
  let node = cell, found = null;
  while (node) { const s = getComputedStyle(node); if (s.display === "grid" && s.overflow !== "visible" || s.gridTemplateRows.match(/^0px$/)) { found = node; break; } node = node.parentElement; }
  const target = found || cell.closest("div");
  return Math.round(target.getBoundingClientRect().height);
});

console.log("at rest   -> wrapper height:", await wrapH(), "| timeline:", await page.getByTestId("duty-timeline").count());
await page.evaluate(() => window.scrollTo(0, 120));
await page.waitForTimeout(800);
console.log("scroll 120 -> wrapper height:", await wrapH(), "| timeline:", await page.getByTestId("duty-timeline").count());
await page.screenshot({ path: `${OUT}/v7-expanded.png`, fullPage: true });
const txt = (await page.getByTestId("day-detail-card").innerText()).replace(/\n{2,}/g, "\n");
console.log("--- card while expanded ---\n" + txt);

await page.evaluate(() => window.scrollTo(0, 45));
await page.waitForTimeout(600);
console.log("at 45px    -> timeline still open (hysteresis):", (await page.getByTestId("duty-timeline").count()) > 0);

await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(800);
console.log("back to 0  -> timeline:", await page.getByTestId("duty-timeline").count());
await browser.close();

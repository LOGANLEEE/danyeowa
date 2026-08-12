import { chromium, devices } from "@playwright/test";
const OUT = "/private/tmp/claude-502/-Users-loganlee-project-portfolio-roaster-me/a6a6729f-6b3e-4b2a-ac05-d86549b7c2d3/scratchpad";
const BASE = "http://localhost:8787";
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"], hasTouch: true });
const page = await ctx.newPage();

// 1. Splash must paint before JS. Block the JS bundle and see what's on screen.
await page.route("**/assets/*.js", (r) => r.abort());
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForTimeout(400);
const splash = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 60));
console.log("splash with JS blocked:", JSON.stringify(splash) || "(nothing)");
await page.screenshot({ path: `${OUT}/s1-splash.png` });
await page.unroute("**/assets/*.js");

// 2. Real app, then swipe.
await page.goto(BASE + "/");
await page.getByLabel(/email/i).fill("logan@example.com");
await page.getByRole("button", { name: /send code/i }).click();
const code = page.getByLabel(/code/i); await code.waitFor(); await code.fill("123123");
await page.getByRole("button", { name: /^sign in$/i }).click();
await page.getByTestId("calendar-day-2026-08-10").waitFor({ timeout: 20000 });

const monthText = () => page.evaluate(() => {
  const p = [...document.querySelectorAll("p")].find((e) => /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/.test(e.textContent || ""));
  return p?.textContent?.trim() ?? "?";
});
const grid = page.getByTestId("calendar-grid");
const box = await grid.boundingBox();
const cy = box.y + box.height / 2;

async function drag(fromX, toX, fromY, toY) {
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(fromX + ((toX - fromX) * i) / 6, fromY + ((toY - fromY) * i) / 6);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(350);
}

console.log("start month:", await monthText());
await drag(box.x + box.width - 30, box.x + 30, cy, cy);        // swipe left
console.log("after swipe left: ", await monthText());
await drag(box.x + 30, box.x + box.width - 30, cy, cy);        // swipe right
console.log("after swipe right:", await monthText());

const before = await monthText();
await drag(box.x + box.width / 2, box.x + box.width / 2 + 20, box.y + 20, box.y + 200);  // mostly vertical
console.log("after vertical drag (want unchanged):", await monthText(), before === (await monthText()) ? "OK" : "CHANGED");

// 3. A tap must still select a day, and a swipe must not.
await page.getByTestId("calendar-day-2026-08-21").click();
console.log("tap still selects a day:", (await page.getByTestId("day-detail-card").count()) > 0);

await browser.close();

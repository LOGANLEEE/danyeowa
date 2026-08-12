import { chromium, devices } from "@playwright/test";
const BASE = "http://localhost:8787";
const EMAIL = "logan@example.com";
const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices["iPhone 13"] })).newPage();
await page.goto(BASE + "/");
await page.getByLabel(/email/i).fill(EMAIL);
await page.getByRole("button", { name: /send code/i }).click();
const code = page.getByLabel(/code/i); await code.waitFor();
await code.fill("123123");
await page.getByRole("button", { name: /^sign in$/i }).click();
await page.getByTestId("calendar-day-2026-08-10").waitFor({ timeout: 20000 });
await page.getByTestId("calendar-day-2026-08-30").click();
await page.getByTestId("flightno-input").fill("372");
await page.getByTestId("autofill-card").waitFor({ timeout: 15000 });
await page.getByTestId("day-detail-card").getByRole("button", { name: /add to roster|adding/i }).first().click();
await page.getByTestId("delete-trip").waitFor({ timeout: 15000 });
await page.waitForTimeout(600);

// Sample every 60ms straight after the scroll: does the document shrink below the viewport,
// forcing the browser to clamp scrollY back to 0 and undo the collapse?
const samples = await page.evaluate(async () => {
  const out = [];
  const de = document.documentElement;
  window.scrollTo(0, 200);
  for (let i = 0; i < 10; i++) {
    out.push({
      t: i * 60,
      y: Math.round(window.scrollY),
      docH: de.scrollHeight,
      viewH: de.clientHeight,
      canScroll: de.scrollHeight - de.clientHeight,
      timeline: !!document.querySelector('[data-testid="duty-timeline"]'),
    });
    await new Promise((r) => setTimeout(r, 60));
  }
  return out;
});
for (const s of samples) {
  console.log(`t=${String(s.t).padStart(3)}ms  y=${String(s.y).padStart(3)}  docH=${s.docH}  scrollable=${String(s.canScroll).padStart(4)}  timeline=${s.timeline}`);
}
await browser.close();

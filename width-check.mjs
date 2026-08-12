import { chromium, devices } from "@playwright/test";
const BASE = "http://localhost:8787";
const EMAIL = `w${Date.now()}@local.test`;   // fresh account => empty state => the centred branch
const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices["iPhone 13"] })).newPage();

await page.goto(BASE + "/");
await page.getByLabel(/email/i).fill(EMAIL);
await page.getByRole("button", { name: /send code/i }).click();
const code = page.getByLabel(/code/i); await code.waitFor();
const { otp } = await (await page.request.get(`${BASE}/api/__e2e/last-otp?email=${encodeURIComponent(EMAIL)}`)).json();
await code.fill(otp);
await page.getByRole("button", { name: /^sign in$/i }).click();
await page.getByText(/no trips yet/i).waitFor({ timeout: 15000 });

// Invariant: the calendar grid must be exactly as wide as the column it sits in.
async function check(label) {
  const r = await page.evaluate(() => {
    const cell = document.querySelector('[data-testid^="calendar-day-"]');
    const grid = cell.closest(".grid-cols-7");
    const col = grid.closest(".max-w-xl");
    return { grid: Math.round(grid.getBoundingClientRect().width), col: Math.round(col.getBoundingClientRect().width) };
  });
  const ok = Math.abs(r.grid - r.col) <= 1;
  console.log(`${label.padEnd(30)} grid=${r.grid}px container=${r.col}px  ${ok ? "MATCH" : "MISMATCH"}`);
  return ok;
}

let allOk = await check("empty state (no trips)");

// Select a future free day -> inline add form appears in the same branch.
const iso = "2026-08-27";
await page.getByTestId(`calendar-day-${iso}`).click();
await page.getByTestId("day-detail-card").waitFor();
await page.waitForTimeout(250);
allOk = (await check("empty day selected")) && allOk;

console.log(allOk ? "RESULT: consistent" : "RESULT: still inconsistent");
await browser.close();

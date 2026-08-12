import { chromium } from "@playwright/test";
const BASE = "http://localhost:8787";
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(BASE + "/");
await page.getByLabel(/email/i).fill("logan@example.com");
await page.getByRole("button", { name: /send code/i }).click();
const c = page.getByLabel(/code/i); await c.waitFor(); await c.fill("123123");
await page.getByRole("button", { name: /^sign in$/i }).click();
await page.getByTestId("calendar-day-2026-08-10").waitFor({ timeout: 20000 });

for (const f of ["EK247", "EK049", "EK49", "EK248"]) {
  const t0 = Date.now();
  const res = await page.request.get(`${BASE}/api/schedule/lookup?flight_no=${f}&date=2026-09-05`);
  const ms = Date.now() - t0;
  let body = ""; try { body = JSON.stringify(await res.json()).slice(0, 110); } catch {}
  console.log(`${f.padEnd(6)} http=${res.status()} ${String(ms).padStart(5)}ms  ${body}`);
}
await browser.close();

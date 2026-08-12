import { chromium } from "@playwright/test";
const BASE = "http://localhost:8787";
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(BASE + "/");
await page.getByLabel(/email/i).fill("logan@example.com");
await page.getByRole("button", { name: /send code/i }).click();
const c = page.getByLabel(/code/i); await c.waitFor(); await c.fill("123123");
await page.getByRole("button", { name: /^sign in$/i }).click();
await page.getByTestId("calendar-day-2026-08-10").waitFor({ timeout: 15000 });

async function timeIt(flightNo, date) {
  const t0 = Date.now();
  const res = await page.request.get(`${BASE}/api/schedule/lookup?flight_no=${flightNo}&date=${date}`);
  const ms = Date.now() - t0;
  let legs = "?";
  try { legs = (await res.json()).legs?.length ?? 0; } catch {}
  return { ms, status: res.status(), legs };
}

console.log("COLD (never looked up before):");
for (const f of ["EK21", "EK77", "EK203"]) {
  const r = await timeIt(f, "2026-09-02");
  console.log(`  ${f.padEnd(6)} ${String(r.ms).padStart(6)}ms  http=${r.status} legs=${r.legs}`);
}
console.log("WARM (same flights again):");
for (const f of ["EK21", "EK77", "EK203"]) {
  const r = await timeIt(f, "2026-09-02");
  console.log(`  ${f.padEnd(6)} ${String(r.ms).padStart(6)}ms  http=${r.status} legs=${r.legs}`);
}
console.log("UNKNOWN flight (full provider chain then miss):");
const m = await timeIt("EK9998", "2026-09-02");
console.log(`  EK9998 ${String(m.ms).padStart(6)}ms  http=${m.status} legs=${m.legs}`);
await browser.close();

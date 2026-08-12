import { chromium, devices } from "@playwright/test";
const BASE = "http://localhost:8787";
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();

// Make the lookup deterministically slow, so the queued-submit path is actually exercised
// rather than depending on a cold cache.
await page.route("**/api/schedule/lookup*", async (route) => {
  await new Promise((r) => setTimeout(r, 2000));
  await route.continue();
});

await page.goto(BASE + "/");
const EMAIL = `queue${Date.now()}@local.test`;
await page.getByLabel(/email/i).fill(EMAIL);
await page.getByRole("button", { name: /send code/i }).click();
const code = page.getByLabel(/code/i); await code.waitFor();
const { otp } = await (await page.request.get(`${BASE}/api/__e2e/last-otp?email=${encodeURIComponent(EMAIL)}`)).json();
await code.fill(otp);
await page.getByRole("button", { name: /^sign in$/i }).click();
await page.getByTestId("calendar-day-2026-08-10").waitFor({ timeout: 20000 });

const DAY = "2026-08-26";
await page.getByTestId(`calendar-day-${DAY}`).click();
await page.getByTestId("flightno-input").waitFor();

// 1. Button must exist and be enabled BEFORE the lookup resolves.
await page.getByTestId("flightno-input").fill("412");
await page.waitForTimeout(500);            // past the 400ms debounce, lookup now in flight
const addBtn = page.getByTestId("day-detail-card").getByRole("button", { name: /add to roster|adding/i });
const visible = await addBtn.count();
const enabled = visible ? await addBtn.first().isEnabled() : false;
console.log(`during lookup: button present=${visible > 0} enabled=${enabled}`);

// 2. Press it mid-flight — the save must happen once the lookup lands.
await addBtn.first().click();
console.log("pressed while resolving; waiting for the queued save…");
await page.getByTestId("delete-trip").waitFor({ timeout: 20000 });
const trips = await (await page.request.get(BASE + "/api/trips")).json();
const onDay = trips.trips.filter((t) => t.flights.some((f) => f.depUtc.startsWith(DAY)));
console.log(`queued save landed: trips=${onDay.length} flights=${onDay.flatMap(t => t.flights.map(f => f.flightNo)).join(",")}`);

// 3. Cancellation: press Add, then change the number — nothing should be saved for the new day.
const DAY2 = "2026-08-30";
await page.getByTestId(`calendar-day-${DAY2}`).click();
await page.getByTestId("flightno-input").fill("372");
await page.waitForTimeout(500);
await page.getByTestId("day-detail-card").getByRole("button", { name: /add to roster|adding/i }).first().click();
await page.getByTestId("flightno-input").fill("373");     // changed mind mid-flight
await page.waitForTimeout(4000);
const after = await (await page.request.get(BASE + "/api/trips")).json();
const day2 = after.trips.filter((t) => t.flights.some((f) => f.depUtc.startsWith(DAY2)));
console.log(`after editing the number: saved=${day2.length} (want 0) ${day2.flatMap(t => t.flights.map(f => f.flightNo)).join(",")}`);

await browser.close();
console.log("done");

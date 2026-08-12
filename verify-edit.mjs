import { chromium } from "@playwright/test";

const OUT = "/private/tmp/claude-502/-Users-loganlee-project-portfolio-roaster-me/a6a6729f-6b3e-4b2a-ac05-d86549b7c2d3/scratchpad";
const BASE = "http://localhost:8799";
const EMAIL = "logan@example.com";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });

await page.goto(BASE + "/");
await page.getByLabel(/email/i).fill(EMAIL);
await page.getByRole("button", { name: /send code/i }).click();
const code = page.getByLabel(/code/i);
await code.waitFor();
await code.fill("123123");
await page.getByRole("button", { name: /^sign in$/i }).click();
await page.getByTestId("calendar-day-2026-08-10").waitFor({ timeout: 15000 });

// ONE tap on an empty day must land straight on the flight-code input.
await page.getByTestId("calendar-day-2026-08-25").click();
const input = page.getByTestId("flightno-input");
await input.waitFor({ timeout: 5000 });
console.log("one tap -> input focused ready:", await input.count());
console.log("no 'Add trip' button in the way:", (await page.getByRole("button", { name: /^add trip$/i }).count()) === 0);
console.log("no bottom sheet in the DOM:", (await page.getByTestId("day-sheet").count()) === 0);
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/v6-inline-add.png`, fullPage: true });

// Turnaround: outbound + appended return, saved as one trip.
await input.fill("372");
await page.getByTestId("autofill-card").waitFor({ timeout: 9000 });
await page.getByTestId("append-flight").click();
await page.getByTestId("append-flightno-input").fill("373");
await page.getByTestId("day-detail-card").getByRole("button", { name: /^add$/i }).click();
await page.getByTestId("appended-card").waitFor({ timeout: 9000 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/v6-turnaround.png`, fullPage: true });

await page.getByTestId("day-detail-card").getByRole("button", { name: /add to roster/i }).click();
await page.getByTestId("delete-trip").waitFor({ timeout: 9000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/v6-after-add.png`, fullPage: true });

const trips = await (await page.request.get(BASE + "/api/trips")).json();
const day = trips.trips.filter((t) => t.flights.some((f) => f.depUtc.startsWith("2026-08-25")));
console.log("trips on day:", day.length, "| legs:", day.flatMap((t) => t.flights.map((f) => `${f.flightNo} ${f.origin}->${f.dest}`)).join(" , "));

// The + button should select a day and show the form, not open anything.
await page.getByTestId("tab-add").click();
await page.waitForTimeout(600);
console.log("+ button -> inline form, no sheet:", (await page.getByTestId("day-sheet").count()) === 0 && (await page.getByTestId("flightno-input").count()) > 0);

await browser.close();
console.log("done");

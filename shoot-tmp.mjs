import { chromium } from "@playwright/test";

const OUT = "/private/tmp/claude-502/-Users-loganlee-project-portfolio-roaster-me/a6a6729f-6b3e-4b2a-ac05-d86549b7c2d3/scratchpad";
const EMAIL = "visual-check13@local.test";
const BASE = "http://localhost:8787";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });

await page.goto(BASE + "/");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.getByLabel(/email/i).fill(EMAIL);
await page.getByRole("button", { name: /send code/i }).click();
const codeInput = page.getByLabel(/code/i);
await codeInput.waitFor();
const { otp } = await (await page.request.get(BASE + "/api/__e2e/last-otp?email=" + encodeURIComponent(EMAIL))).json();
await codeInput.fill(otp);
await page.getByRole("button", { name: /sign in/i }).click();
await page.getByTestId("calendar-day-2026-08-10").waitFor();

// Open the add sheet on an empty future day, type DIGITS only.
await page.getByTestId("calendar-day-2026-08-18").click();
await page.getByTestId("day-detail-card").waitFor();
await page.getByTestId("day-detail-action").click();
await page.getByTestId("day-sheet").waitFor();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/v3-sheet-empty.png`, fullPage: true });

await page.getByTestId("flightno-input").fill("372");
await page.getByTestId("autofill-card").waitFor({ timeout: 8000 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/v3-prefix-preview.png`, fullPage: true });
console.log("manual-expand visible on a KNOWN flight (want 0):", await page.getByTestId("manual-expand").count());

await page.getByRole("button", { name: /add to roster/i }).click();
await page.getByTestId("day-sheet").waitFor({ state: "detached", timeout: 8000 });
console.log("sheet after add (want 0):", await page.getByTestId("day-sheet").count());
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/v3-after-add-closed.png`, fullPage: true });

// Inline expand on the trip day.
await page.getByTestId("calendar-day-2026-08-18").click();
await page.getByTestId("day-detail-action").click();
await page.getByTestId("trip-legs-panel").waitFor();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/v3-inline-expand.png`, fullPage: true });
console.log("sheet while editing (want 0):", await page.getByTestId("day-sheet").count());

// Is the bin actually reachable, or hidden behind the fixed tab bar?
const bin = page.getByTestId("delete-trip");
// Scroll the page fully down, as a user would, before judging occlusion.
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(300);
const binBox = await bin.boundingBox();
const barBox = await page.locator("nav, [data-testid='tab-calendar']").first().boundingBox();
console.log(`bin bottom ${binBox.y + binBox.height} | tabbar top ${barBox.y} | occluded: ${binBox.y + binBox.height > barBox.y}`);
await page.screenshot({ path: `${OUT}/v3-bin-reachable.png` });
await bin.click();
await page.getByTestId("confirm-delete").waitFor();
console.log("confirm step reachable: yes");
await page.screenshot({ path: `${OUT}/v3-confirm.png` });

// Unknown flight -> manual fallback appears.
await page.getByTestId("calendar-day-2026-08-25").click();
await page.getByTestId("day-detail-action").click();
await page.getByTestId("day-sheet").waitFor();
await page.getByTestId("flightno-input").fill("999");
await page.waitForTimeout(3000);
console.log("manual-expand on a MISS (want 1):", await page.getByTestId("manual-expand").count());
await page.screenshot({ path: `${OUT}/v3-miss-manual.png`, fullPage: true });

await browser.close();
console.log("done");

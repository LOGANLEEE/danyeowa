import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

await page.goto("http://localhost:8787/");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.getByLabel(/email/i).fill("visual-check@local.test");
await page.getByRole("button", { name: /send code/i }).click();

const codeInput = page.getByLabel(/code/i);
await codeInput.waitFor();
const res = await page.request.get(
  "http://localhost:8787/api/__e2e/last-otp?email=" + encodeURIComponent("visual-check@local.test"),
);
const { otp } = await res.json();
await codeInput.fill(otp);
await page.getByRole("button", { name: /sign in/i }).click();

await page.getByRole("button", { name: /add (your first )?trip/i }).click();

// Navigate the picker to a future day (today + a few days ahead, next month if needed).
for (let i = 0; i < 3; i++) {
  const next = page.getByTestId("calendar-next");
  await next.click();
}
await page.waitForTimeout(200);
// Click day 15 of whatever month we landed on.
const dayCells = await page.locator('[data-testid^="calendar-day-"]').all();
let clicked = false;
for (const cell of dayCells) {
  const testId = await cell.getAttribute("data-testid");
  if (testId && testId.endsWith("-15") && (await cell.isEnabled())) {
    await cell.click();
    clicked = true;
    break;
  }
}
if (!clicked) throw new Error("could not find an enabled day-15 cell");

await page.getByTestId("flightno-input").fill("EK412");
await page.getByTestId("autofill-card").waitFor({ timeout: 5000 });
await page.waitForTimeout(300);

await page.screenshot({ path: "/private/tmp/claude-502/-Users-loganlee-project-portfolio-roaster-me/1540f342-8166-44bf-8c28-79e888cc5822/scratchpad/autofill-390-fixed.png", fullPage: true });

await browser.close();
console.log("done");

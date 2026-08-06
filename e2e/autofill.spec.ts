import { expect, test } from "@playwright/test";
import { UNKNOWN_FLIGHT_NO, humanDateLabel, openDaySheet, signInThroughUi, signOutThroughUi } from "./helpers";

/**
 * Manual-fallback + multi-leg coverage for the day sheet's add flow, complementing
 * roster.spec.ts's primary EK412-autofill + rapid-chain + Trips-tab + edit/delete flow:
 *   1. Unknown flight (XX999, no flight_schedules row) - lookup miss falls through to the
 *      full manual-entry path, which joins the SAME rapid-entry chain as the autofill path
 *      (banner + Done), then a second manual add lands on the suggested next date.
 *   2. EK384 (DXB -> BKK -> HKG, two legs) - a cheap smoke test that the autofill card
 *      renders both legs of a multi-leg schedule lookup.
 *
 * Both scenarios share a single sign-in (one test, one `signInThroughUi` call): better-auth's
 * email-OTP rate limit is IP-keyed (`worker/src/auth.ts`, `rateLimit: { window: 60, max: 3 }`),
 * not per-email, and the local dev server sees every Playwright request from the same IP.
 * Combined with roster.spec.ts's one sign-in, this suite sends 2 OTPs total - well under the
 * documented 3-per-60s budget.
 */
const AUTOFILL_EMAIL = "e2e-autofill@local.test";

/** DXB -> BKK -> HKG, EK384 (scripts/ek-schedules.json): 2 legs, both same-day. */
const EK384 = {
  flightNo: "EK384",
  leg0: { origin: "DXB", dest: "BKK" },
  leg1: { origin: "BKK", dest: "HKG" },
};

/** Picked date used across this file's scenarios - future, and distinct from roster.spec.ts's
 * FIXTURE month (2026-09) so the two spec files' trips never land in the same calendar cell. */
const PICKED_DATE = "2026-11-12";

async function cleanUpAllTrips(page: import("@playwright/test").Page) {
  await page.getByTestId("tab-trips").click();
  const existingRow = page.getByTestId("upcoming-row").first();
  for (let i = 0; i < 5; i++) {
    if (!(await existingRow.isVisible().catch(() => false))) break;
    await existingRow.click();
    await page.getByTestId("delete-trip").click();
    await page.getByTestId("confirm-delete").click();
    await page.getByText(/no trips yet/i).or(existingRow).first().waitFor().catch(() => {});
  }
  await page.getByTestId("tab-calendar").click();
}

test.describe.configure({ mode: "serial" });

test("manual-entry fallback joins the rapid chain, then EK384 multi-leg smoke", async ({ page }) => {
  await signInThroughUi(page, AUTOFILL_EMAIL);
  await cleanUpAllTrips(page);
  await page.getByTestId("tab-trips").click();
  await expect(page.getByText(/no trips yet/i)).toBeVisible();
  await page.getByTestId("tab-calendar").click();

  // --- Scenario 1: unknown flight -> lookup miss -> manual expand -> full save -> rapid chain. ---
  await openDaySheet(page, PICKED_DATE);
  const sheet = page.getByTestId("day-sheet");
  await expect(sheet).toBeVisible();
  await page.getByTestId("flightno-input").fill(UNKNOWN_FLIGHT_NO);
  await expect(page.getByText(/unknown flight/i)).toBeVisible();
  await expect(page.getByTestId("autofill-card")).not.toBeVisible();

  await page.getByTestId("manual-expand").click();

  // Manual form prefilled with the picked date, empty times - fill the rest by hand.
  const depInput = page.getByLabel(/departure \(local\)/i);
  await expect(depInput).toHaveValue(`${PICKED_DATE}T00:00`);

  await page.getByLabel(/flight no/i).fill(UNKNOWN_FLIGHT_NO);
  await page.getByLabel(/^origin$/i).fill("DXB");
  await page.getByLabel(/^origin$/i).blur();
  await page.getByLabel(/^dest$/i).fill("LHR");
  await page.getByLabel(/^dest$/i).blur();
  await depInput.fill(`${PICKED_DATE}T09:15`);
  await page.getByLabel(/arrival \(local\)/i).fill(`${PICKED_DATE}T13:35`);
  await page.getByRole("button", { name: /add to roster/i }).click();

  // Manual entry joins the same rapid-entry chain as the autofill path: banner + cleared
  // flight-no field + Done, on the day after PICKED_DATE (nothing else on the roster to skip).
  const banner = page.getByTestId("rapid-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(`Added ${humanDateLabel(PICKED_DATE)}`);
  const nextIso = "2026-11-13";
  await expect(page.getByTestId("rapid-next-date")).toHaveText(humanDateLabel(nextIso));
  await expect(page.getByTestId("flightno-input")).toHaveValue("");

  // --- Second manual add on the suggested next date, via the same open sheet. ---
  await expect(page.getByText(/unknown flight/i)).not.toBeVisible();
  await page.getByTestId("flightno-input").fill(UNKNOWN_FLIGHT_NO);
  await expect(page.getByText(/unknown flight/i)).toBeVisible();
  await page.getByTestId("manual-expand").click();
  await expect(depInput).toHaveValue(`${nextIso}T00:00`);
  await page.getByLabel(/flight no/i).fill(UNKNOWN_FLIGHT_NO);
  await page.getByLabel(/^origin$/i).fill("DXB");
  await page.getByLabel(/^origin$/i).blur();
  await page.getByLabel(/^dest$/i).fill("LHR");
  await page.getByLabel(/^dest$/i).blur();
  await depInput.fill(`${nextIso}T09:15`);
  await page.getByLabel(/arrival \(local\)/i).fill(`${nextIso}T13:35`);
  await page.getByRole("button", { name: /add to roster/i }).click();
  await expect(banner).toContainText(`Added ${humanDateLabel(nextIso)}`);

  await page.getByTestId("done-button").click();
  await expect(sheet).not.toBeVisible();

  // Both manual-entry days marked on the calendar.
  await expect(page.getByTestId(`calendar-day-${PICKED_DATE}`)).toHaveClass(/bg-accent-soft/);
  await expect(page.getByTestId(`calendar-day-${nextIso}`)).toHaveClass(/bg-accent-soft/);

  await page.getByTestId("tab-trips").click();
  await expect(page.getByTestId("upcoming-row")).toHaveCount(2);
  await cleanUpAllTrips(page);
  await page.getByTestId("tab-trips").click();
  await expect(page.getByText(/no trips yet/i)).toBeVisible();
  await page.getByTestId("tab-calendar").click();

  // --- Scenario 2: multi-leg smoke - EK384 lookup renders both legs in the autofill card. ---
  await openDaySheet(page, PICKED_DATE);
  await expect(sheet).toBeVisible();
  await page.getByTestId("flightno-input").fill(EK384.flightNo);

  const autofillCard = page.getByTestId("autofill-card");
  await expect(autofillCard).toBeVisible();
  await expect(autofillCard).toContainText(`${EK384.leg0.origin} → ${EK384.leg0.dest}`);
  await expect(autofillCard).toContainText(`${EK384.leg1.origin} → ${EK384.leg1.dest}`);

  // Two legs -> two dep/arr time inputs rendered in the card.
  await expect(page.getByTestId("autofill-dep")).toHaveCount(2);
  await expect(page.getByTestId("autofill-arr")).toHaveCount(2);

  // Not saving this one - no seeded trip to clean up. Dismiss the sheet (its scrim would
  // otherwise intercept the tab-bar clicks in signOutThroughUi) then sign out.
  await page.getByTestId("sheet-close").click();
  await signOutThroughUi(page);
});

import { expect, test } from "@playwright/test";
import { UNKNOWN_FLIGHT_NO, pickCalendarDay, signInThroughUi, signOutThroughUi } from "./helpers";

/**
 * Autofill + manual-fallback coverage for the calendar-first stepper (plan 5, task 4).
 * roster.spec.ts already exercises the 1-leg EK001 autofill path end-to-end as part of the
 * main lifecycle spec; this file adds the scenarios the brief calls out specifically:
 *   1. EK412 (DXB -> SYD, a real seeded flight_schedules row) - asserts the exact seeded
 *      dep/arr times render unedited, and that the saved trip's report time is computed
 *      as dep - 90min in the origin's local tz (Asia/Dubai has no DST, so this is stable
 *      for any future date).
 *   2. XX999, a flight number with no flight_schedules row - asserts the lookup miss falls
 *      through to the full manual-entry path, and that path can complete a trip end-to-end.
 *   3. EK384 (DXB -> BKK -> HKG, two legs) - a cheap smoke test that the autofill card
 *      renders both legs of a multi-leg schedule lookup.
 *
 * All three scenarios share a single sign-in (one test, one `signInThroughUi` call) rather
 * than one per scenario: better-auth's email-OTP rate limit is IP-keyed (`worker/src/auth.ts`,
 * `rateLimit: { window: 60, max: 3 }`), not per-email, and the local dev server sees every
 * Playwright request from the same IP. Three separate sign-ins here previously exhausted
 * that budget and starved roster.spec.ts's own sign-in when both files ran in the same
 * `pnpm exec playwright test` invocation (workers: 1, but the 60s rate-limit window doesn't
 * care about file boundaries). One sign-in per file keeps the combined suite's OTP-send count
 * well under the limit.
 */
const AUTOFILL_EMAIL = "e2e-autofill@local.test";

/** DXB -> SYD, EK412 leg 0 (scripts/ek-schedules.json): daily, dep 10:15 arr 06:00 +1 day. */
const EK412 = {
  flightNo: "EK412",
  origin: "DXB",
  dest: "SYD",
  depTime: "10:15",
  arrTime: "06:00",
  // dep 10:15 Asia/Dubai (no DST) - 90min = report 08:45 local, year-round.
  reportLocal: "08:45",
};

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
  const existingRow = page.getByTestId("next-duty-card").or(page.getByTestId("upcoming-row").first());
  for (let i = 0; i < 5; i++) {
    if (!(await existingRow.isVisible().catch(() => false))) break;
    await existingRow.click();
    await page.getByTestId("delete-trip").click();
    await page.getByTestId("confirm-delete").click();
    await page.getByText(/no trips yet/i).or(page.getByTestId("next-duty-card")).first().waitFor().catch(() => {});
  }
}

test.describe.configure({ mode: "serial" });

test("autofill + manual fallback: EK412 known flight, XX999 unknown flight, EK384 multi-leg", async ({
  page,
}) => {
  await signInThroughUi(page, AUTOFILL_EMAIL);
  await cleanUpAllTrips(page);
  await expect(page.getByText(/no trips yet/i)).toBeVisible();

  // --- Scenario 1: known flight EK412 -> autofill card -> save -> report time = dep-90m. ---
  await pickCalendarDay(page, PICKED_DATE);
  await expect(page.getByTestId("day-sheet")).toBeVisible();
  await page.getByTestId("flightno-input").fill(EK412.flightNo);

  const autofillCard = page.getByTestId("autofill-card");
  await expect(autofillCard).toBeVisible();
  await expect(autofillCard).toContainText(`${EK412.origin} → ${EK412.dest}`);

  // EK412 is a 2-leg schedule (DXB->SYD->CHC, scripts/ek-schedules.json) - assert the
  // SEEDED leg-0 dep/arr values render unedited on the first leg's inputs.
  await expect(page.getByTestId("autofill-dep").first()).toHaveValue(EK412.depTime);
  await expect(page.getByTestId("autofill-arr").first()).toHaveValue(EK412.arrTime);

  // Report chip (leg 0) shows the computed default (dep - 90min local) before save.
  await expect(page.getByTestId("report-chip").first()).toContainText(EK412.reportLocal);

  await page.getByRole("button", { name: /add to roster/i }).click();

  // Calendar home's next-duty card shows the FULL route chain - every stop in order, not
  // just endpoints - since EK412 is a 2-leg DXB->SYD->CHC schedule: "DXB → SYD → CHC".
  let dutyCard = page.getByTestId("next-duty-card");
  await expect(dutyCard).toBeVisible();
  await expect(dutyCard).toContainText(`${EK412.origin} → ${EK412.dest} → CHC`);
  await expect(dutyCard).toContainText(EK412.flightNo);
  await expect(dutyCard).toContainText(EK412.reportLocal);

  // Cleanup before the next scenario.
  await dutyCard.click();
  await page.getByTestId("delete-trip").click();
  await page.getByTestId("confirm-delete").click();
  await expect(page.getByText(/no trips yet/i)).toBeVisible();

  // --- Scenario 2: unknown flight XX999 -> lookup miss -> manual expand -> full save. ---
  await pickCalendarDay(page, PICKED_DATE);
  await expect(page.getByTestId("day-sheet")).toBeVisible();
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

  dutyCard = page.getByTestId("next-duty-card");
  await expect(dutyCard).toBeVisible();
  await expect(dutyCard).toContainText("DXB → LHR");

  // Cleanup before the next scenario.
  await dutyCard.click();
  await page.getByTestId("delete-trip").click();
  await page.getByTestId("confirm-delete").click();
  await expect(page.getByText(/no trips yet/i)).toBeVisible();

  // --- Scenario 3: multi-leg smoke - EK384 lookup renders both legs in the autofill card. ---
  await pickCalendarDay(page, PICKED_DATE);
  await expect(page.getByTestId("day-sheet")).toBeVisible();
  await page.getByTestId("flightno-input").fill(EK384.flightNo);

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

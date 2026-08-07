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

/**
 * DXB -> SYD -> CHC, EK412 (scripts/ek-schedules.json), picked 2026-09-10 - a DIFFERENT
 * calendar cell than roster.spec.ts's own EK412 fixture (which uses pickedDate 2026-09-10
 * too, but that spec runs in its own signed-in session under a different test account
 * (E2E_EMAIL vs AUTOFILL_EMAIL), so the two never collide server-side).
 *
 * Leg0 DXB dep 10:15 Asia/Dubai (no DST) on 2026-09-10 = 2026-09-10T06:15:00.000Z.
 * Leg0 arr SYD 06:00 Australia/Sydney, dayOffset 1 -> local date 2026-09-11 =
 * 2026-09-10T20:00:00.000Z.
 * Leg1 SYD dep 07:45 Australia/Sydney, dayOffset 0 -> same local date 2026-09-11 =
 * 2026-09-10T21:45:00.000Z.
 * Leg1 arr CHC 12:55 Pacific/Auckland, dayOffset 0 -> same local date 2026-09-11 =
 * 2026-09-11T00:55:00.000Z. This is the trip's final-leg arrival: the `arrivedIso` fed to
 * GET /api/schedule/suggest (Pacific/Auckland is UTC+12 in September - NZDT starts late
 * September, so no DST transition here).
 *
 * suggestReturns queries origin=CHC, date=addDaysIso(localDateKey(arrUtc, "Pacific/Auckland"),
 * 1) = addDaysIso("2026-09-11", 1) = "2026-09-12". EK413's leg0 (CHC->SYD, dep 14:00 local,
 * daily "1234567") operates that same query date (2026-09-12) - a viable connection (dep
 * after arrival) - so no roll-forward is needed: EK413's resolved dateIso is "2026-09-12".
 * EK413 leg0 dep 2026-09-12T14:00 Pacific/Auckland = 2026-09-12T02:00:00.000Z.
 * layoverHours = (2026-09-12T02:00:00.000Z - 2026-09-11T00:55:00.000Z) = 25h05m =
 * 25.0833... hours -> formatHours (shared/src/time.ts, rounds to nearest whole hour, then
 * days+hours once >= 24) renders this as "1d 1h" (25 = 1*24 + 1).
 */
const EK412_RETURN = {
  outbound: {
    flightNo: "EK412",
    origin: "DXB",
    dest: "SYD",
    depTime: "10:15",
    arrTime: "06:00",
    pickedDate: "2026-09-10",
  },
  ret: {
    flightNo: "EK413",
    dateIso: "2026-09-12",
    layoverLabel: "1d 1h",
  },
};

/**
 * DXB -> BCN, EK097, then BCN -> DXB, EK098 (scripts/ek-schedules.json): a same-day
 * turnaround (round trip). Picked date 2026-09-15 - free, and outside the EK412_RETURN
 * chain's span (2026-09-10 through 2026-09-12/13) so the two scenarios' calendar marks
 * never overlap.
 *
 * EK097 leg0: DXB dep 08:20 Asia/Dubai, dayOffset 0 -> arr BCN 12:35 Europe/Madrid, same
 * local date 2026-09-15 (both legs same calendar day at their own tz).
 * EK098's append anchor date = addDaysIso(EK097's depDate, EK097's dayOffset) = 2026-09-15
 * (dayOffset 0) - EK098 leg0 (BCN->DXB, dep 14:15 local, daily) operates that date.
 * EK098 arr DXB 00:05 Asia/Dubai, dayOffset 1 -> local date 2026-09-16.
 *
 * One combined trip, 2 legs (leg_seq 0 = EK097, leg_seq 1 = EK098) - the whole round trip
 * away-spans 2026-09-15 through 2026-09-16 in Asia/Dubai (home base) local dates.
 */
const TURNAROUND = {
  outbound: { flightNo: "EK097", origin: "DXB", dest: "BCN" },
  appended: { flightNo: "EK098", origin: "BCN", dest: "DXB" },
  pickedDate: "2026-09-15",
  spanEndDate: "2026-09-16",
};

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

  const sheet = page.getByTestId("day-sheet");
  const autofillCard = page.getByTestId("autofill-card");
  const banner = page.getByTestId("rapid-banner");

  // --- Scenario A: return-suggestion chip - add EK412 (DXB->SYD->CHC, lands away from home),
  // the rapid "added" state offers EK413 (sibling flight_no, pinned first) as a return chip
  // with a computed layover badge; tapping it prefills add-mode on EK413's own resolved date
  // + flight number, reusing the normal autofill lookup flow. Save both -> one combined
  // calendar span across both pairings, both trips visible via the Trips tab row count.
  // Runs FIRST (Sept dates) — pickCalendarDay/openDaySheet (helpers.ts) only navigate the
  // calendar FORWARD via calendar-next, so every scenario in this file must run in
  // chronological date order. ---
  await openDaySheet(page, EK412_RETURN.outbound.pickedDate);
  await expect(sheet).toBeVisible();
  await page.getByTestId("flightno-input").fill(EK412_RETURN.outbound.flightNo);
  await expect(autofillCard).toBeVisible();
  await expect(autofillCard).toContainText(`${EK412_RETURN.outbound.origin} → ${EK412_RETURN.outbound.dest}`);
  await expect(page.getByTestId("autofill-dep").first()).toHaveValue(EK412_RETURN.outbound.depTime);
  await expect(page.getByTestId("autofill-arr").first()).toHaveValue(EK412_RETURN.outbound.arrTime);
  await page.getByRole("button", { name: /add to roster/i }).click();

  await expect(banner).toContainText(`Added ${humanDateLabel(EK412_RETURN.outbound.pickedDate)}`);

  const returnChip = page.getByTestId(`return-chip-${EK412_RETURN.ret.flightNo}`);
  await expect(returnChip).toBeVisible();
  await expect(returnChip).toContainText(EK412_RETURN.ret.flightNo);
  await expect(returnChip).toContainText(humanDateLabel(EK412_RETURN.ret.dateIso));
  await expect(returnChip).toContainText(EK412_RETURN.ret.layoverLabel);

  await returnChip.click();

  // Tapping the chip prefills add-mode: flight-no set to EK413, the sheet's picked date
  // replaced with EK413's own resolved operating date - the normal debounced lookup then
  // renders the autofill card for EK413 on that date, same as typing it in would.
  await expect(page.getByTestId("flightno-input")).toHaveValue(EK412_RETURN.ret.flightNo);
  await expect(autofillCard).toBeVisible();
  await expect(autofillCard).toContainText("CHC → SYD");
  await page.getByRole("button", { name: /add to roster/i }).click();
  await expect(banner).toContainText(`Added ${humanDateLabel(EK412_RETURN.ret.dateIso)}`);

  await page.getByTestId("done-button").click();
  await expect(sheet).not.toBeVisible();

  // Both pairings' spans marked on the calendar (EK412 away-span + EK413's own operating date).
  await expect(page.getByTestId(`calendar-day-${EK412_RETURN.outbound.pickedDate}`)).toHaveClass(
    /bg-accent-soft/,
  );
  await expect(page.getByTestId(`calendar-day-${EK412_RETURN.ret.dateIso}`)).toHaveClass(/bg-accent-soft/);

  // Trips tab: one row per LEG (TripsView.tsx), not per trip - EK412 (2 legs) + EK413
  // (2 legs) = 4 rows across the two saved trips.
  await page.getByTestId("tab-trips").click();
  await expect(page.getByTestId("upcoming-row")).toHaveCount(4);
  await cleanUpAllTrips(page);
  await page.getByTestId("tab-trips").click();
  await expect(page.getByText(/no trips yet/i)).toBeVisible();
  await page.getByTestId("tab-calendar").click();

  // --- Scenario B: turnaround - "+ add flight" chains EK098 onto EK097's preview as ONE
  // combined trip (leg_seq continues), before any save. The appended card renders alongside
  // the outbound card; saving posts a single trip with both legs, which the Trips tab shows
  // as one round trip (DXB->BCN->DXB) worth of rows. ---
  await openDaySheet(page, TURNAROUND.pickedDate);
  await expect(sheet).toBeVisible();
  await page.getByTestId("flightno-input").fill(TURNAROUND.outbound.flightNo);
  await expect(autofillCard).toBeVisible();
  await expect(autofillCard).toContainText(`${TURNAROUND.outbound.origin} → ${TURNAROUND.outbound.dest}`);

  await page.getByTestId("append-flight").click();
  await page.getByTestId("append-flightno-input").fill(TURNAROUND.appended.flightNo);
  await sheet.getByRole("button", { name: "Add", exact: true }).click();

  const appendedCard = page.getByTestId("appended-card");
  await expect(appendedCard).toBeVisible();
  await expect(appendedCard).toContainText(TURNAROUND.appended.flightNo);
  await expect(appendedCard).toContainText(`${TURNAROUND.appended.origin} → ${TURNAROUND.appended.dest}`);

  await page.getByRole("button", { name: /add to roster/i }).click();
  await expect(banner).toContainText(`Added ${humanDateLabel(TURNAROUND.pickedDate)}`);

  await page.getByTestId("done-button").click();
  await expect(sheet).not.toBeVisible();

  await expect(page.getByTestId(`calendar-day-${TURNAROUND.pickedDate}`)).toHaveClass(/bg-accent-soft/);
  await expect(page.getByTestId(`calendar-day-${TURNAROUND.spanEndDate}`)).toHaveClass(/bg-accent-soft/);

  // One combined trip (EK097 + EK098, 2 legs) -> 2 rows, not two separate trips.
  await page.getByTestId("tab-trips").click();
  await expect(page.getByTestId("upcoming-row")).toHaveCount(2);

  await cleanUpAllTrips(page);
  await page.getByTestId("tab-trips").click();
  await expect(page.getByText(/no trips yet/i)).toBeVisible();
  await page.getByTestId("tab-calendar").click();

  // --- Scenario 1: unknown flight -> lookup miss -> manual expand -> full save -> rapid chain.
  // PICKED_DATE (2026-11-12) is after both scenarios above (2026-09-10..16), so the
  // calendar's forward-only navigation reaches it without ever needing to go back. ---
  await openDaySheet(page, PICKED_DATE);
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

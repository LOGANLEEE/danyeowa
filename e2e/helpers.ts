import type { Page } from "@playwright/test";

/** Test account used across the spec — idempotent because each run deletes its own trip. */
export const E2E_EMAIL = "e2e@local.test";

/**
 * DXB -> LHR fixture with a computable expected report time (dep - 90min, see
 * shared/src/time.ts reportDefault): dep wall 09:15 Asia/Dubai -> report wall 07:45.
 * After the spec edits dep to 10:15, report becomes 08:45.
 *
 * EK001 is a real seeded flight_schedules row (DXB->LHR, daily) - the autofill card
 * prefills different times (08:35/12:40) than this fixture, but the stepper lets those
 * be edited inline before save, so the spec overwrites them to keep the same expected
 * report-time math across the manual-vs-autofill rewrite.
 */
export const FIXTURE = {
  flightNo: "EK001",
  origin: "DXB",
  dest: "LHR",
  dep: "2026-09-10T09:15",
  arr: "2026-09-10T13:35",
  depTime: "09:15",
  arrTime: "13:35",
  depEdited: "2026-09-10T10:15",
  reportBefore: "07:45",
  reportAfter: "08:45",
};

/** Unknown-to-schedule flight number used to exercise the manual-entry fallback path. Shares
 * the app's fixed "EK" airline-code prefix — AddTripForm.tsx's flightno-input only accepts
 * typed digits, the prefix itself isn't user-typeable — so it can be composed by filling just
 * its digit suffix, the same way every other fixture flight number in this suite is. */
export const UNKNOWN_FLIGHT_NO = "EK999";

/**
 * DXB -> SYD -> CHC, EK412 (scripts/ek-schedules.json, real seeded 2-leg schedule): a
 * multi-day trip whose away-span (first-leg departure's to last-leg arrival's LOCAL
 * calendar date, in the home base tz Asia/Dubai) covers TWO calendar days, not one - useful
 * fixture shape since a single-leg, same-day flight like FIXTURE/EK001 can't exercise a
 * multi-day span at all. Picked date 2026-09-10: leg 0 departs 10:15 Asia/Dubai the picked
 * day, arrives Sydney the next day; leg 1 departs Sydney the same day it arrives and lands
 * in Christchurch a bit later - the whole pairing's away-span in Asia/Dubai local dates is
 * 2026-09-10 through 2026-09-11 (verified against shared/src/time.ts's wallToUtc/localDateKey).
 */
export const EK412 = {
  flightNo: "EK412",
  origin: "DXB",
  dest: "SYD",
  depTime: "10:15",
  arrTime: "06:00",
  // dep 10:15 Asia/Dubai (no DST) - 90min = report 08:45 local, year-round.
  reportLocal: "08:45",
  pickedDate: "2026-09-10",
  spanEndDate: "2026-09-11",
  // A free day after the span ends - nothing suggests it (rapid-entry chaining is gone), so
  // this is just the picked date for the suite's own second sequential add of the same flight.
  nextFreeDate: "2026-09-12",
  // A second EK412 pairing re-added (by typing the same flight number again) on
  // `nextFreeDate` spans 2026-09-12 through 2026-09-13 (same 2-day shape, one day later) -
  // also verified against shared/src/time.ts.
  secondPairingSpanEndDate: "2026-09-13",
};

/**
 * Clicks a calendar day cell identified by `iso` ("YYYY-MM-DD") ONCE, advancing the visible
 * month via the "next month" chevron first if the cell isn't rendered yet (the day-picker
 * and trip calendars both default to the current month view and only render 6 weeks of
 * the active month/adjacent-month spillover). A single tap SELECTS the day, showing its
 * detail card on the calendar-home grid — for an empty day that card IS the add-trip form
 * (no second tap, no sheet); use `openAddForm` to also wait for that form to be ready.
 */
export async function pickCalendarDay(page: Page, iso: string): Promise<void> {
  for (let i = 0; i < 24; i++) {
    const cell = page.getByTestId(`calendar-day-${iso}`);
    if (await cell.isVisible().catch(() => false)) {
      await cell.click();
      return;
    }
    await page.getByTestId("calendar-next").click();
  }
  throw new Error(`calendar-day-${iso} never became visible after 24 months of navigation`);
}

/**
 * Selects `iso` on the calendar-home grid (via `pickCalendarDay`) and waits for its inline
 * add-trip form to be ready — the empty-day detail card renders the form directly, one tap,
 * no bottom sheet.
 */
export async function openAddForm(page: Page, iso: string): Promise<void> {
  await pickCalendarDay(page, iso);
  await page.getByTestId("flightno-input").waitFor();
}

/** Fetches the most recently captured dev-fallback OTP via the E2E_TEST_MODE-gated route. */
async function fetchLastOtp(page: Page, email: string): Promise<string> {
  const res = await page.request.get(`/api/__e2e/last-otp?email=${encodeURIComponent(email)}`);
  if (!res.ok()) {
    throw new Error(`__e2e/last-otp failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { otp: string };
  return body.otp;
}

/** Drives the full landing -> email OTP sign-in flow via the real UI. The email field is on
 * the landing surface itself (no separate login screen/CTA to navigate through first). */
export async function signInThroughUi(page: Page, email = E2E_EMAIL): Promise<void> {
  await page.goto("/");
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole("button", { name: /send code/i }).click();

  const codeInput = page.getByLabel(/code/i);
  await codeInput.waitFor();
  const otp = await fetchLastOtp(page, email);
  await codeInput.fill(otp);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** Signs out via the Settings tab (Plan6 T2 moved the sign-out control off the header). */
export async function signOutThroughUi(page: Page): Promise<void> {
  await page.getByTestId("tab-settings").click();
  await page.getByRole("button", { name: /sign out/i }).click();
}

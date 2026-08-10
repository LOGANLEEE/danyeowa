import { expect, test } from "@playwright/test";
import { E2E_EMAIL, EK412, openDaySheet } from "./helpers";

/**
 * Full e2e coverage of the Plan 6 tabbed, calendar-first UX against a real `wrangler dev`
 * (local D1). Starts already signed in — the `chromium` project's storageState, written once
 * by auth.setup.ts, is loaded fresh for this test's own context, so this file sends zero OTPs
 * of its own. (The real sign-in UI walk — landing page's inline email OTP form, verified — is
 * asserted once in auth.setup.ts instead of being duplicated here.)
 *
 * This file does NOT sign out: better-auth's sign-out deletes the session server-side, not
 * just the local cookie, so calling it here would invalidate the SAME session
 * share.spec.ts's storageState-backed context relies on (it runs after this file). Real
 * sign-out UI coverage lives in share.spec.ts, the last file in the suite to run.
 *
 * Full flow covered: calendar home, day sheet, autofill add (the sheet auto-closes and
 * refetches on save - rapid-entry chaining is gone), a second EK412 pairing added the same
 * way via a fresh day-sheet open on a later free day, both days marked on the calendar, the
 * Trips tab listing both, a detail edit, and both deletes.
 *
 * Idempotent by construction: any trip left over from a prior failed run is deleted by the
 * cleanup loop below before assertions begin, so re-running never accumulates state.
 *
 * Auth coverage stays on the email OTP path only: Google's real OAuth consent screen
 * actively blocks automated sign-in, so there's no reliable way to drive the "Continue
 * with Google" button through Playwright. That path is covered by unit tests (Landing.test.tsx)
 * that assert authClient.signIn.social is called correctly, plus manual verification.
 */
test("calendar home -> day sheet -> autofill add -> sequential add -> Trips tab -> edit -> delete both", async ({
  page,
}) => {
  // Already signed in via the shared storageState (auth.setup.ts) — go straight to the app.
  await page.goto("/");
  await expect(page.getByTestId("tab-calendar")).toBeVisible();
  await expect(page.getByTestId("calendar-next")).toBeVisible();

  // Clean slate: delete any trip(s) left over from a previous failed run.
  await page.getByTestId("tab-trips").click();
  const existingRow = page.getByTestId("upcoming-row").first();
  const emptyState = page.getByText(/no trips yet/i);
  // The Trips tab's own getTrips() fetch resolves after the tab switch renders - wait for
  // it to settle (a row or the empty state) before checking, so a still-loading tab isn't
  // mistaken for an already-empty one (this loop's own delete cycle handles waiting between
  // iterations already; this is only the FIRST check, before anything has been deleted yet).
  await Promise.race([existingRow.waitFor(), emptyState.waitFor()]).catch(() => {});
  for (let i = 0; i < 5; i++) {
    if (!(await existingRow.isVisible().catch(() => false))) break;
    await existingRow.click();
    await page.getByTestId("delete-trip").click();
    await page.getByTestId("confirm-delete").click();
    await Promise.race([emptyState.waitFor(), existingRow.waitFor()]).catch(() => {});
  }
  await expect(emptyState).toBeVisible();

  // --- Tap a day on the calendar home to open the sheet's add flow. Single tap selects the
  // day (shows its detail card); a second tap opens the sheet (openDaySheet does both). ---
  await page.getByTestId("tab-calendar").click();
  const firstIso = EK412.pickedDate;
  await openDaySheet(page, firstIso);
  const sheet = page.getByTestId("day-sheet");
  await expect(sheet).toBeVisible();

  // EK412 autofill: real seeded DXB->SYD->CHC schedule row (scripts/ek-schedules.json), a
  // genuinely multi-day pairing — its away-span (home-base local dates) runs firstIso
  // through EK412.spanEndDate, TWO calendar days, not one. Exercising the calendar's
  // whole-span marking (both days get bg-accent-soft, not just the tapped one) is the point
  // of this scenario, not incidental — a same-day single-leg flight couldn't cover it.
  await page.getByTestId("flightno-input").fill(EK412.flightNo.slice(2));
  const autofillCard = page.getByTestId("autofill-card");
  await expect(autofillCard).toBeVisible();
  await expect(autofillCard).toContainText(`${EK412.origin} → ${EK412.dest}`);
  await expect(page.getByTestId("autofill-dep").first()).toHaveValue(EK412.depTime);
  await expect(page.getByTestId("autofill-arr").first()).toHaveValue(EK412.arrTime);
  await page.getByRole("button", { name: /add to roster/i }).click();

  // --- Save closes the sheet immediately (rapid-entry chaining is gone) and fires a single
  // refetch. The tapped day (firstIso) stays selected through the close, so its detail card -
  // not the next-duty card - is what's showing now. ---
  await expect(sheet).not.toBeVisible();
  await expect(page.getByTestId("day-detail-card")).toBeVisible();
  await expect(page.getByTestId(`calendar-day-${firstIso}`)).toHaveClass(/bg-accent-soft/);
  await expect(page.getByTestId(`calendar-day-${EK412.spanEndDate}`)).toHaveClass(/bg-accent-soft/);
  // A free day after the span ends must NOT be marked.
  const secondPickedDate = EK412.nextFreeDate;
  await expect(page.getByTestId(`calendar-day-${secondPickedDate}`)).not.toHaveClass(/bg-accent-soft/);

  // --- Second pairing: tap the next free day and add the SAME flight again the normal way -
  // no recent-flight chip anymore, just type it. ---
  await openDaySheet(page, secondPickedDate);
  await expect(sheet).toBeVisible();
  await page.getByTestId("flightno-input").fill(EK412.flightNo.slice(2));
  await expect(autofillCard).toBeVisible();
  await page.getByRole("button", { name: /add to roster/i }).click();
  await expect(sheet).not.toBeVisible();

  // The first pairing's span AND the second pairing's span are all marked.
  await expect(page.getByTestId(`calendar-day-${firstIso}`)).toHaveClass(/bg-accent-soft/);
  await expect(page.getByTestId(`calendar-day-${EK412.spanEndDate}`)).toHaveClass(/bg-accent-soft/);
  await expect(page.getByTestId(`calendar-day-${secondPickedDate}`)).toHaveClass(/bg-accent-soft/);
  await expect(page.getByTestId(`calendar-day-${EK412.secondPairingSpanEndDate}`)).toHaveClass(/bg-accent-soft/);

  // --- Trips tab lists both pairings - one row PER LEG (TripsView.tsx renders a row per
  // flight, not per trip), and EK412 is 2 legs each, so 2 trips = 4 rows. ---
  await page.getByTestId("tab-trips").click();
  await expect(page.getByTestId("upcoming-row")).toHaveCount(4);

  // --- Detail: edit one trip's departure, save, see the report time change. ---
  // Sets the departure clock time to 12:00 local (DXB / Asia/Dubai, no DST) so the recomputed
  // report time (dep - 90min, shared/src/time.ts reportDefault) is deterministically 10:30.
  // EK412 is a 2-leg trip - "first()" edits leg 0 (DXB->SYD, Asia/Dubai origin).
  await page.getByTestId("upcoming-row").first().click();
  await page.getByTestId("edit-leg").first().click();
  const depInput = page.getByLabel(/departure \(local\)/i);
  const currentDep = await depInput.inputValue();
  const editedDep = currentDep.replace(/T\d{2}:\d{2}/, "T12:00");
  await depInput.fill(editedDep);
  await page.getByTestId("save-leg").click();
  await expect(page.getByText(/report 10:30/i)).toBeVisible();

  // Back to the Trips list, delete both trips.
  await page.getByRole("button", { name: /back/i }).click();
  for (let i = 0; i < 5; i++) {
    const firstRow = page.getByTestId("upcoming-row").first();
    const emptyState = page.getByText(/no trips yet/i);
    await Promise.race([firstRow.waitFor(), emptyState.waitFor()]);
    if (await emptyState.isVisible().catch(() => false)) break;
    await firstRow.click();
    await page.getByTestId("delete-trip").click();
    await page.getByTestId("confirm-delete").click();
  }
  await expect(page.getByText(/no trips yet/i)).toBeVisible();
});

test.beforeAll(() => {
  // Sanity: the account used across this suite must be the documented test address.
  expect(E2E_EMAIL).toBe("e2e@local.test");
});

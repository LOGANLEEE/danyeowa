import { expect, test } from "@playwright/test";
import { E2E_EMAIL, EK412, openAddForm } from "./helpers";

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
 * Full flow covered: calendar home, the inline add-trip form on an empty day's detail card,
 * autofill add (a save clears the form and refetches, flipping the card to the trip view - no
 * bottom sheet), a second EK412 pairing added the same way on a later free day, both days
 * marked on the calendar, the Trips tab listing both, a detail edit, and both deletes.
 *
 * Idempotent by construction: any trip left over from a prior failed run is deleted by the
 * cleanup loop below before assertions begin, so re-running never accumulates state.
 *
 * Auth coverage stays on the email OTP path only: Google's real OAuth consent screen
 * actively blocks automated sign-in, so there's no reliable way to drive the "Continue
 * with Google" button through Playwright. That path is covered by unit tests (Landing.test.tsx)
 * that assert authClient.signIn.social is called correctly, plus manual verification.
 */
test("calendar home -> inline add-trip form -> autofill add -> sequential add -> Trips tab -> edit -> delete both", async ({
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

  // --- Tap a day on the calendar home: single tap selects it and, since it's empty, its
  // detail card IS the add-trip form (openAddForm selects + waits for the form). ---
  await page.getByTestId("tab-calendar").click();
  const firstIso = EK412.pickedDate;
  await openAddForm(page, firstIso);

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

  // --- Save clears the form and the parent's refetch flips the tapped day's own detail card
  // (it stays selected throughout) from the add form over to the trip view. ---
  await expect(page.getByTestId("delete-trip")).toBeVisible();
  await expect(page.getByTestId("flightno-input")).not.toBeVisible();
  await expect(page.getByTestId(`calendar-day-${firstIso}`)).toHaveClass(/bg-accent-soft/);
  await expect(page.getByTestId(`calendar-day-${EK412.spanEndDate}`)).toHaveClass(/bg-accent-soft/);
  // A free day after the span ends must NOT be marked.
  const secondPickedDate = EK412.nextFreeDate;
  await expect(page.getByTestId(`calendar-day-${secondPickedDate}`)).not.toHaveClass(/bg-accent-soft/);

  // --- Second pairing: tap the next free day and add the SAME flight again the normal way -
  // no recent-flight chip anymore, just type it. ---
  await openAddForm(page, secondPickedDate);
  await page.getByTestId("flightno-input").fill(EK412.flightNo.slice(2));
  await expect(autofillCard).toBeVisible();
  await page.getByRole("button", { name: /add to roster/i }).click();
  await expect(page.getByTestId("delete-trip")).toBeVisible();

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

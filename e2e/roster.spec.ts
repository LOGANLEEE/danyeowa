import { expect, test } from "@playwright/test";
import { E2E_EMAIL, EK412, humanDateLabel, openDaySheet, signInThroughUi, signOutThroughUi } from "./helpers";

/**
 * Full e2e coverage of the Plan 6 tabbed, calendar-first UX against a real `wrangler dev`
 * (local D1). One coherent sign-in drives the entire primary flow — landing, calendar home,
 * day sheet, autofill add, rapid-entry chaining (banner + recent-chip re-add on the
 * suggested next date), Done's single refetch, both days marked on the calendar, the Trips
 * tab listing both, a detail edit, both deletes, and sign-out — so the suite stays within
 * the email-OTP rate limit (`worker/src/auth.ts`, `rateLimit: { window: 60, max: 3 }`,
 * IP-keyed, not per-email): this file sends exactly one OTP, autofill.spec.ts sends one more
 * for its manual-fallback + multi-leg coverage, for two sign-ins total across the run well
 * under the 3-per-60s budget.
 *
 * Idempotent by construction: any trip left over from a prior failed run is deleted by the
 * cleanup loop below before assertions begin, so re-running never accumulates state.
 *
 * Auth coverage stays on the email OTP path only: Google's real OAuth consent screen
 * actively blocks automated sign-in, so there's no reliable way to drive the "Continue
 * with Google" button through Playwright. That path is covered by unit tests (Login.test.tsx)
 * that assert authClient.signIn.social is called correctly, plus manual verification.
 */
test("sign-in -> calendar home -> day sheet -> autofill add -> rapid chain -> Trips tab -> edit -> delete both -> sign out", async ({
  page,
}) => {
  // Landing renders with no header band (App.tsx renders no <header> at all when signed
  // out on the landing view).
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /roaster/i, level: 1 })).toBeVisible();
  await expect(page.locator("header")).toHaveCount(0);

  await signInThroughUi(page);

  // Signed in: calendar home is the default tab — month grid + tab bar both render.
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
  // through EK412.spanEndDate, TWO calendar days, not one. This is the shape that exposed
  // the rapid-entry "next date" bug (fixed: DaySheet.tsx's nextFreeDate/justAdded now track
  // the full saved span, not just the tapped date) — using it here, rather than a same-day
  // single-leg flight, is the point of this scenario, not incidental.
  await page.getByTestId("flightno-input").fill(EK412.flightNo);
  const autofillCard = page.getByTestId("autofill-card");
  await expect(autofillCard).toBeVisible();
  await expect(autofillCard).toContainText(`${EK412.origin} → ${EK412.dest}`);
  await expect(page.getByTestId("autofill-dep").first()).toHaveValue(EK412.depTime);
  await expect(page.getByTestId("autofill-arr").first()).toHaveValue(EK412.arrTime);
  await page.getByRole("button", { name: /add to roster/i }).click();

  // --- Rapid state: banner asserts the added date and the computed next-suggested date -
  // the day AFTER the trip's full away-span ends, not the day after the tapped date (which
  // would still be inside this same trip's own span, the bug this scenario guards against). ---
  const suggestedNext = EK412.nextFreeDate;

  const banner = page.getByTestId("rapid-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(`Added ${humanDateLabel(firstIso)}`);
  await expect(page.getByTestId("rapid-next-date")).toHaveText(humanDateLabel(suggestedNext));

  // Flight-no field cleared + refocused. Recent-flight chips derive from the trips already
  // fetched when the sheet opened (no live update mid-session — see useRecentFlights),
  // so the just-saved flight isn't offered as a chip yet on this same open sheet; it will
  // be after Done's refetch + reopening the sheet, exercised below.
  await expect(page.getByTestId("flightno-input")).toHaveValue("");

  // --- Done for now: single refetch, back to the calendar, BOTH span days marked. The
  // tapped day (firstIso) stays selected through the sheet closing, so its detail card -
  // not the next-duty card - is what's showing now. ---
  await page.getByTestId("done-button").click();
  await expect(sheet).not.toBeVisible();
  await expect(page.getByTestId("day-detail-card")).toBeVisible();
  await expect(page.getByTestId(`calendar-day-${firstIso}`)).toHaveClass(/bg-accent-soft/);
  await expect(page.getByTestId(`calendar-day-${EK412.spanEndDate}`)).toHaveClass(/bg-accent-soft/);
  // The day between firstIso and spanEndDate (there isn't one here - span is exactly 2
  // days) and the suggested next date itself must NOT be marked - it's genuinely free.
  await expect(page.getByTestId(`calendar-day-${suggestedNext}`)).not.toHaveClass(/bg-accent-soft/);

  // --- Reopen the sheet on the suggested next date: now that trips have been refetched,
  // the flight is offered as a recent-flight chip. Tap it to re-add the same flight there. ---
  await openDaySheet(page, suggestedNext);
  await expect(sheet).toBeVisible();
  const recentChip = page.getByTestId(`recent-chip-${EK412.flightNo}`);
  await expect(recentChip).toBeVisible();
  await recentChip.click();
  await expect(autofillCard).toBeVisible();
  await page.getByRole("button", { name: /add to roster/i }).click();
  await expect(banner).toContainText(`Added ${humanDateLabel(suggestedNext)}`);

  // Done again -> the first pairing's span AND the second pairing's span are all marked.
  await page.getByTestId("done-button").click();
  await expect(sheet).not.toBeVisible();
  await expect(page.getByTestId(`calendar-day-${firstIso}`)).toHaveClass(/bg-accent-soft/);
  await expect(page.getByTestId(`calendar-day-${EK412.spanEndDate}`)).toHaveClass(/bg-accent-soft/);
  await expect(page.getByTestId(`calendar-day-${suggestedNext}`)).toHaveClass(/bg-accent-soft/);
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

  // --- Sign out -> back to landing. ---
  await signOutThroughUi(page);
  await expect(page.getByRole("heading", { name: /roaster/i, level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test.beforeAll(() => {
  // Sanity: the account used across this suite must be the documented test address.
  expect(E2E_EMAIL).toBe("e2e@local.test");
});

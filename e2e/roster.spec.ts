import { expect, test } from "@playwright/test";
import {
  E2E_EMAIL,
  FIXTURE,
  UNKNOWN_FLIGHT_NO,
  pickCalendarDay,
  signInThroughUi,
  signOutThroughUi,
} from "./helpers";

/**
 * Full auth + roster lifecycle against a real `wrangler dev` (local D1). Idempotent by
 * construction: signs in as a fixed test account, and any leftover trip from a prior
 * failed run is deleted by the "empty state" step below (or the delete step at the end
 * of a clean run) before a new trip is created — so re-running never accumulates state.
 *
 * Auth coverage stays on the email OTP path only: Google's real OAuth consent screen
 * actively blocks automated sign-in, so there's no reliable way to drive the "Continue
 * with Google" button through Playwright. That path is covered by unit tests (Login.test.tsx)
 * that assert authClient.signIn.social is called correctly, plus manual verification.
 */
test("landing -> sign in -> create, edit, delete trip -> sign out", async ({ page }) => {
  // Landing renders with no header band (App.tsx renders no <header> at all when signed
  // out on the landing view).
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /roaster/i, level: 1 })).toBeVisible();
  await expect(page.locator("header")).toHaveCount(0);

  await signInThroughUi(page);

  // Signed in: header now renders (slimmed to the wordmark; sign-out moved to Settings) and
  // the tab bar appears.
  await expect(page.getByTestId("tab-calendar")).toBeVisible();

  // Clean slate: delete any trip left over from a previous failed run so the empty
  // state / create-trip assertions below are reliable.
  const existingRow = page.getByTestId("next-duty-card").or(page.getByTestId("upcoming-row").first());
  if (await existingRow.isVisible().catch(() => false)) {
    await existingRow.click();
    await page.getByTestId("delete-trip").click();
    await page.getByTestId("confirm-delete").click();
  }

  // Empty state.
  await expect(page.getByText(/no trips yet/i)).toBeVisible();

  // Create a 1-leg trip by tapping the target day on the calendar, which opens the day
  // sheet's add flow for that day: type the known flight number (EK001, a real seeded
  // DXB->LHR schedule row), then edit the autofilled times inline to the fixture's exact
  // values before saving.
  await pickCalendarDay(page, FIXTURE.dep.slice(0, 10));
  const sheet = page.getByTestId("day-sheet");
  await expect(sheet).toBeVisible();
  await page.getByTestId("flightno-input").fill(FIXTURE.flightNo);

  const autofillCard = page.getByTestId("autofill-card");
  await expect(autofillCard).toBeVisible();
  await page.getByTestId("autofill-dep").fill(FIXTURE.depTime);
  await page.getByTestId("autofill-arr").fill(FIXTURE.arrTime);
  await page.getByRole("button", { name: /add to roster/i }).click();

  // Plan 6 Task 5: the sheet stays open in the rapid-entry "added" state after a successful
  // add (no per-add refetch) - dismiss with "Done for now" to trigger the single refetch.
  await expect(page.getByTestId("rapid-banner")).toBeVisible();
  await page.getByTestId("done-button").click();

  // Crew home shows the computed report time: dep 09:15 - 90min = 07:45.
  const dutyCard = page.getByTestId("next-duty-card");
  await expect(dutyCard).toContainText(FIXTURE.reportBefore);
  await expect(dutyCard).toContainText(`${FIXTURE.origin} → ${FIXTURE.dest}`);

  // Open detail, edit dep +1h, save.
  await dutyCard.click();
  await expect(sheet).toBeVisible();
  await page.getByTestId("edit-leg").click();
  await page.getByLabel(/departure \(local\)/i).fill(FIXTURE.depEdited);
  await page.getByTestId("save-leg").click();

  // Back on the sheet's summary (not editing) the report time reflects the new departure:
  // 08:45. Scoped to the sheet - the next-duty card behind it also mentions "Report 08:45".
  await expect(sheet.getByText(`Report ${FIXTURE.reportAfter}`)).toBeVisible();

  // Delete trip -> confirm -> sheet closes -> back to empty state.
  await page.getByTestId("delete-trip").click();
  await page.getByTestId("confirm-delete").click();
  await expect(page.getByText(/no trips yet/i)).toBeVisible();

  // Sign out -> back to landing.
  await signOutThroughUi(page);
  await expect(page.getByRole("heading", { name: /roaster/i, level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("calendar tab: tap a future day, create a trip, see the away marker, then check the Trips tab list", async ({
  page,
}) => {
  await signInThroughUi(page);

  // Clean slate: this test can leave up to two trips behind on a failed run (the seed trip
  // plus the calendar-created one), so loop until every trip is gone rather than deleting once.
  // The Trips tab (not Calendar) is where the upcoming-list rows live post-Plan6-T3.
  await page.getByTestId("tab-trips").click();
  const existingRow = page.getByTestId("next-duty-card").or(page.getByTestId("upcoming-row").first());
  while (await existingRow.isVisible().catch(() => false)) {
    await existingRow.click();
    await page.getByTestId("delete-trip").click();
    await page.getByTestId("confirm-delete").click();
  }
  await expect(page.getByText(/no trips yet/i)).toBeVisible();

  // Seed the first trip via the calendar's tap-to-add path (day sheet) before exercising it
  // a second time below.
  await page.getByTestId("tab-calendar").click();
  await pickCalendarDay(page, FIXTURE.dep.slice(0, 10));
  await expect(page.getByTestId("day-sheet")).toBeVisible();
  await page.getByTestId("flightno-input").fill(FIXTURE.flightNo);
  await expect(page.getByTestId("autofill-card")).toBeVisible();
  await page.getByTestId("autofill-dep").fill(FIXTURE.depTime);
  await page.getByTestId("autofill-arr").fill(FIXTURE.arrTime);
  await page.getByRole("button", { name: /add to roster/i }).click();

  // Rapid-entry: sheet stays open after the add - dismiss to refetch and see the calendar.
  await expect(page.getByTestId("rapid-banner")).toBeVisible();
  await page.getByTestId("done-button").click();

  // Calendar tab is home post-T3: the month grid renders alongside the next-duty card.
  await expect(page.getByTestId("next-duty-card")).toBeVisible();
  await expect(page.getByTestId("calendar-next")).toBeVisible();

  // Advance two months so the picked day is guaranteed in the future regardless of today's
  // date, and distinct from the FIXTURE trip's month (2026-09).
  await page.getByTestId("calendar-next").click();
  await page.getByTestId("calendar-next").click();
  const monthHeading = page.getByText(/^\w+ \d{4}$/);
  const monthLabel = (await monthHeading.textContent())!.trim();
  const [monthName, yearStr] = monthLabel.split(" ");
  const monthIndex = new Date(`${monthName} 1, 2000`).getMonth(); // 0-indexed
  const year = Number(yearStr);
  const targetDay = 15;
  const iso = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;

  await page.getByTestId(`calendar-day-${iso}`).click();

  // The day sheet's add flow opens for the tapped day. An unrecognized flight number falls
  // back to manual entry, prefilled with the picked day, time empty.
  const sheet = page.getByTestId("day-sheet");
  await expect(sheet).toBeVisible();
  await page.getByTestId("flightno-input").fill(UNKNOWN_FLIGHT_NO);
  await expect(page.getByText(/unknown flight/i)).toBeVisible();
  await page.getByTestId("manual-expand").click();

  const depInput = page.getByLabel(/departure \(local\)/i);
  await expect(depInput).toHaveValue(`${iso}T00:00`);

  // Complete the second trip's creation.
  await page.getByLabel(/^origin$/i).fill(FIXTURE.origin);
  await page.getByLabel(/^origin$/i).blur();
  await page.getByLabel(/^dest$/i).fill(FIXTURE.dest);
  await page.getByLabel(/^dest$/i).blur();
  await depInput.fill(`${iso}T09:15`);
  await page.getByLabel(/arrival \(local\)/i).fill(`${iso}T13:35`);
  await page.getByRole("button", { name: /add to roster/i }).click();

  // The manual-entry path joins the same rapid-entry chain as the autofill path (fix
  // round after code review): banner + Done, same as the seed trip above.
  await expect(page.getByTestId("rapid-banner")).toBeVisible();
  await page.getByTestId("done-button").click();

  // Back on the calendar tab: unlike the old full-screen stepper, the day sheet's close
  // doesn't remount CalendarHome, so the month view stays right where it was left (the
  // target month) - no need to re-navigate. See the away marker directly.
  await page.getByTestId("next-duty-card").waitFor();
  const dayCell = page.getByTestId(`calendar-day-${iso}`);
  await expect(dayCell).toHaveClass(/bg-accent-soft/);

  // Trips tab shows both upcoming rows.
  await page.getByTestId("tab-trips").click();
  await expect(page.getByTestId("upcoming-row")).toHaveCount(2);

  // Clean up: delete both trips created by this test (the first upcoming row always
  // resolves to the earliest trip; repeat until back to the empty state).
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

  await signOutThroughUi(page);
});

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  // Sanity: the account used across this suite must be the documented test address.
  expect(E2E_EMAIL).toBe("e2e@local.test");
});

import { expect, test } from "@playwright/test";
import { E2E_EMAIL, FIXTURE, signInThroughUi } from "./helpers";

/**
 * Full auth + roster lifecycle against a real `wrangler dev` (local D1). Idempotent by
 * construction: signs in as a fixed test account, and any leftover trip from a prior
 * failed run is deleted by the "empty state" step below (or the delete step at the end
 * of a clean run) before a new trip is created — so re-running never accumulates state.
 */
test("landing -> sign in -> create, edit, delete trip -> sign out", async ({ page }) => {
  // Landing renders with no header band (App.tsx renders no <header> at all when signed
  // out on the landing view).
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /roaster/i, level: 1 })).toBeVisible();
  await expect(page.locator("header")).toHaveCount(0);

  await signInThroughUi(page);

  // Signed in: header now renders (with sign-out control).
  await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();

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

  // Create a 1-leg trip: DXB -> LHR, dep 2026-09-10T09:15 local Dubai.
  await page.getByRole("button", { name: /add (your first )?trip/i }).click();
  await page.getByLabel(/flight no/i).fill(FIXTURE.flightNo);
  await page.getByLabel(/^origin$/i).fill(FIXTURE.origin);
  await page.getByLabel(/^origin$/i).blur();
  await page.getByLabel(/^dest$/i).fill(FIXTURE.dest);
  await page.getByLabel(/^dest$/i).blur();
  await page.getByLabel(/departure \(local\)/i).fill(FIXTURE.dep);
  await page.getByLabel(/arrival \(local\)/i).fill(FIXTURE.arr);
  await page.getByRole("button", { name: /^add trip$/i }).click();

  // Crew home shows the computed report time: dep 09:15 - 90min = 07:45.
  const dutyCard = page.getByTestId("next-duty-card");
  await expect(dutyCard).toContainText(FIXTURE.reportBefore);
  await expect(dutyCard).toContainText(`${FIXTURE.origin} → ${FIXTURE.dest}`);

  // Open detail, edit dep +1h, save.
  await dutyCard.click();
  await page.getByTestId("edit-leg").click();
  await page.getByLabel(/departure \(local\)/i).fill(FIXTURE.depEdited);
  await page.getByTestId("save-leg").click();

  // Back on detail (not editing) the report time reflects the new departure: 08:45.
  await expect(page.getByText(`Report ${FIXTURE.reportAfter}`)).toBeVisible();

  // Delete trip -> confirm -> back to empty state.
  await page.getByTestId("delete-trip").click();
  await page.getByTestId("confirm-delete").click();
  await expect(page.getByText(/no trips yet/i)).toBeVisible();

  // Sign out -> back to landing.
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page.getByRole("heading", { name: /roaster/i, level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in with email/i })).toBeVisible();
});

test("calendar view: tap a future day, create a trip, see the away marker, switch back to list", async ({
  page,
}) => {
  await signInThroughUi(page);

  // Clean slate: this test can leave up to two trips behind on a failed run (the seed trip
  // plus the calendar-created one), so loop until every trip is gone rather than deleting once.
  const existingRow = page.getByTestId("next-duty-card").or(page.getByTestId("upcoming-row").first());
  while (await existingRow.isVisible().catch(() => false)) {
    await existingRow.click();
    await page.getByTestId("delete-trip").click();
    await page.getByTestId("confirm-delete").click();
  }
  await expect(page.getByText(/no trips yet/i)).toBeVisible();

  // The view toggle + calendar only appear once a trip exists (next-duty card requires
  // upcoming duty data), so seed the first trip via the empty-state CTA (list flow, already
  // covered by the main lifecycle spec) before exercising the calendar's tap-to-add path.
  await page.getByRole("button", { name: /add (your first )?trip/i }).click();
  await page.getByLabel(/flight no/i).fill(FIXTURE.flightNo);
  await page.getByLabel(/^origin$/i).fill(FIXTURE.origin);
  await page.getByLabel(/^origin$/i).blur();
  await page.getByLabel(/^dest$/i).fill(FIXTURE.dest);
  await page.getByLabel(/^dest$/i).blur();
  await page.getByLabel(/departure \(local\)/i).fill(FIXTURE.dep);
  await page.getByLabel(/arrival \(local\)/i).fill(FIXTURE.arr);
  await page.getByRole("button", { name: /^add trip$/i }).click();
  await expect(page.getByTestId("next-duty-card")).toBeVisible();

  // Switch to Calendar.
  await page.getByRole("button", { name: /^calendar$/i }).click();
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

  // TripForm opens with leg-0 departure date prefilled to the picked day, time empty.
  const depInput = page.getByLabel(/departure \(local\)/i);
  await expect(depInput).toHaveValue(`${iso}T00:00`);

  // Complete the second trip's creation.
  await page.getByLabel(/flight no/i).fill("EK002");
  await page.getByLabel(/^origin$/i).fill(FIXTURE.origin);
  await page.getByLabel(/^origin$/i).blur();
  await page.getByLabel(/^dest$/i).fill(FIXTURE.dest);
  await page.getByLabel(/^dest$/i).blur();
  await depInput.fill(`${iso}T09:15`);
  await page.getByLabel(/arrival \(local\)/i).fill(`${iso}T13:35`);
  await page.getByRole("button", { name: /^add trip$/i }).click();

  // Back on CrewHome (list view is not forced back - the view choice persists) - ensure
  // Calendar is showing, navigate to the same month, and see the away marker.
  await page.getByTestId("next-duty-card").waitFor();
  if (!(await page.getByTestId("calendar-next").isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /^calendar$/i }).click();
  }
  await page.getByTestId("calendar-next").click();
  await page.getByTestId("calendar-next").click();
  const dayCell = page.getByTestId(`calendar-day-${iso}`);
  await expect(dayCell.locator(".bg-away")).toBeVisible();

  // Switch back to list view.
  await page.getByRole("button", { name: /^list$/i }).click();
  await expect(page.getByTestId("next-duty-card")).toBeVisible();
  await expect(page.getByTestId("calendar-next")).not.toBeVisible();

  // Clean up: delete both trips created by this test (next-duty-card always opens the
  // earliest upcoming trip; repeat until back to the empty state). Deleting remounts
  // CrewHome (App.tsx bumps `key`), so wait for either the next-duty-card or the empty
  // state to (re-)settle before deciding whether to continue.
  for (let i = 0; i < 5; i++) {
    const nextDutyCard = page.getByTestId("next-duty-card");
    const emptyState = page.getByText(/no trips yet/i);
    await Promise.race([nextDutyCard.waitFor(), emptyState.waitFor()]);
    if (await emptyState.isVisible().catch(() => false)) break;
    await nextDutyCard.click();
    await page.getByTestId("delete-trip").click();
    await page.getByTestId("confirm-delete").click();
  }
  await expect(page.getByText(/no trips yet/i)).toBeVisible();

  await page.getByRole("button", { name: /sign out/i }).click();
});

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  // Sanity: the account used across this suite must be the documented test address.
  expect(E2E_EMAIL).toBe("e2e@local.test");
});

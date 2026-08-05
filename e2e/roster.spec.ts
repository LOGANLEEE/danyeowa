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

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  // Sanity: the account used across this suite must be the documented test address.
  expect(E2E_EMAIL).toBe("e2e@local.test");
});

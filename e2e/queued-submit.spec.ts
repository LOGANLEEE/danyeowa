import { expect, test } from "@playwright/test";
import { EK412, clearRoster, openAddForm, pickCalendarDay, rosterTrips } from "./helpers";

/**
 * Prod loss of 2026-10-23: Add tapped before the schedule lookup answered, then another day
 * tapped, which unmounted the day-A form. The queued submit died with it and nothing was saved.
 */
test("Add tapped before the lookup answers, then another day, still saves once", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("tab-calendar")).toBeVisible();
  await clearRoster(page);

  await page.route("**/api/schedule/lookup*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.continue();
  });

  const dayA = EK412.pickedDate;
  const dayB = EK412.nextFreeDate;
  try {
    await openAddForm(page, dayA);
    await page.getByTestId("flightno-input").fill(EK412.flightNo.slice(2));
    await page.getByRole("button", { name: /add to roster/i }).click();
    await expect(page.getByRole("button", { name: /adding/i })).toBeVisible();

    // The lookup is still held by the route above, so this unmounts the day-A form mid-queue.
    await pickCalendarDay(page, dayB);
    await expect(page.getByTestId(`calendar-day-${dayB}`)).not.toHaveClass(/bg-accent-soft/);

    await expect(page.getByTestId(`calendar-day-${dayA}`)).toHaveClass(/bg-accent-soft/, { timeout: 10_000 });
    await expect
      .poll(async () => (await rosterTrips(page)).length, { timeout: 10_000 })
      .toBe(1);
    // Hold a beat so a second, late save would show up.
    await page.waitForTimeout(1500);
    const trips = await rosterTrips(page);
    expect(trips).toHaveLength(1);
    // EK412 is DXB->SYD->CHC: one trip, two legs, both under the one flight number.
    expect(trips[0]!.flights.map((f) => f.flightNo)).toEqual([EK412.flightNo, EK412.flightNo]);
  } finally {
    await page.unroute("**/api/schedule/lookup*");
    await clearRoster(page);
  }
});

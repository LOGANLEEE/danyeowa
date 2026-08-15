import { expect, test } from "@playwright/test";
import { EK412, clearRoster, openAddForm, rosterTrips } from "./helpers";

/**
 * A multi-sector flight number is one aircraft routing, not one crew duty. EK412 is
 * DXB → SYD → CHC; the crew can change at Sydney. Before this, the app stored every leg the
 * schedule returned, so someone finishing at SYD was recorded as landing at CHC — wrong in the
 * one number this app exists to get right, the landing time the partner reads.
 *
 * The unflown sector is KEPT, marked not-operating, so the routing stays true. The API partitions
 * it out of `flights` into `continuation`, which is why nothing downstream needs to know.
 */

// Clear of every other spec's dates, so leftovers cannot masquerade as this spec's data.
const PICKED = EK412.pickedDate;

test("multi-sector: getting off early records the earlier landing, and keeps the onward routing", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("tab-calendar")).toBeVisible();
  await clearRoster(page);

  await openAddForm(page, PICKED);
  await page.getByTestId("flightno-input").fill(EK412.flightNo.slice(2));
  await expect(page.getByTestId("autofill-card")).toBeVisible();

  // Both sectors are offered as a final destination; the last one is the default.
  const picker = page.getByTestId("final-destination");
  await expect(picker).toBeVisible();
  await expect(page.getByTestId("continuation-note")).toHaveCount(0);

  // She gets off at Sydney; the aircraft carries on to Christchurch without her.
  await page.getByTestId(`final-dest-${EK412.dest}`).click();
  await expect(page.getByTestId("continuation-note")).toBeVisible();

  await page.getByRole("button", { name: /add to roster/i }).click();
  await expect(page.getByTestId("delete-trip")).toBeVisible();

  // --- The API is the safety mechanism: `flights` holds only her sector. ---
  const trips = await rosterTrips(page);
  expect(trips).toHaveLength(1);
  const trip = trips[0]!;
  expect(trip.flights).toHaveLength(1);
  expect(trip.flights[0]!.dest).toBe(EK412.dest);
  expect(trip.flights[0]!.operating).toBe(true);

  // The unflown sector is kept, not discarded — but out of the field everything else reads.
  expect(trip.continuation).toHaveLength(1);
  expect(trip.continuation![0]!.dest).toBe("CHC");
  expect(trip.continuation![0]!.operating).toBe(false);

  // --- The day card shows the onward routing, clearly not hers. ---
  await page.getByTestId("day-detail-action").click();
  const cont = page.getByTestId("trip-continuation");
  await expect(cont).toBeVisible();
  await expect(cont).toContainText("CHC");

  await clearRoster(page);
});

import { expect, test } from "@playwright/test";
import { UNKNOWN_FLIGHT_NO, clearRoster, expectRosterCount, openAddForm, pickCalendarDay } from "./helpers";

/**
 * The layover brief: how long she is actually free down-route, and a button that packs that
 * context into text for whichever assistant she already uses.
 *
 * Two things here are only true in a real engine and so are measured rather than trusted:
 * the panel has to appear on the day in the MIDDLE of a layover — which has no duty at all,
 * and is therefore the branch that renders "no duty" and nothing else — and the hotel field
 * has to compute to at least 16px or iOS zooms the whole layout on focus.
 */

// Clear of every other spec's dates, so no leftover can fake a pairing.
const OUT_DAY = "2027-05-10";
const LAYOVER_DAY = "2027-05-11"; // no duty at all — the branch that matters
const BACK_DAY = "2027-05-12";

async function addSector(
  page: import("@playwright/test").Page,
  iso: string,
  origin: string,
  dest: string,
  depTime: string,
  arrTime: string,
  expectedTotal: number,
): Promise<void> {
  await page.getByTestId("flightno-input").fill(UNKNOWN_FLIGHT_NO.slice(2));
  await expect(page.getByText(/unknown flight/i)).toBeVisible();
  await page.getByTestId("manual-expand").click();
  await page.getByLabel(/flight no/i).fill(UNKNOWN_FLIGHT_NO);
  await page.getByLabel(/^origin$/i).fill(origin);
  await page.getByLabel(/^origin$/i).blur();
  await page.getByLabel(/^dest$/i).fill(dest);
  await page.getByLabel(/^dest$/i).blur();
  await page.getByLabel(/departure \(local\)/i).fill(`${iso}T${depTime}`);
  await page.getByLabel(/arrival \(local\)/i).fill(`${iso}T${arrTime}`);
  await page.getByRole("button", { name: /add to roster/i }).click();

  await expectRosterCount(page, expectedTotal);
}

test("layover brief: free-until-report on the empty middle day, and the copy carries it", async ({
  page,
  context,
}) => {
  test.slow(); // two manual entries plus clipboard + geometry checks

  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://localhost:8787",
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("tab-calendar")).toBeVisible();
  await clearRoster(page);

  // Out of base on the 10th, back on the 12th. The 11th belongs to neither trip.
  await openAddForm(page, OUT_DAY);
  await addSector(page, OUT_DAY, "DXB", "SYD", "03:00", "22:00", 1);
  await openAddForm(page, BACK_DAY);
  await addSector(page, BACK_DAY, "SYD", "DXB", "18:00", "23:00", 2);

  // --- The middle day: no duty, and the panel is the only thing on it worth reading. ---
  await pickCalendarDay(page, LAYOVER_DAY);
  await expect(page.getByTestId("day-detail-card")).toContainText(/no duty/i);

  const panel = page.getByTestId("layover-brief");
  await expect(panel).toBeVisible();
  // The header shows the resolved city; the bare IATA is only the fallback before it lands.
  await expect(panel).toContainText("Layover · Sydney");

  // Free time is landing -> REPORT, never landing -> departure. Landing 22:00 Sydney on the
  // 10th, report 90 minutes before an 18:00 departure on the 12th: 1d 18h, not 1d 20h.
  await expect(page.getByTestId("layover-free")).toHaveText("1d 18h");

  // --- The hotel field must not trip iOS zoom. ---
  const hotelFontPx = await page
    .getByTestId("layover-hotel")
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(hotelFontPx).toBeGreaterThanOrEqual(16);

  // --- Nothing may scroll sideways at 390px. ---
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "layover panel must not widen the page at 390px").toBeLessThanOrEqual(0);

  // --- The copy carries the roster context, including the hotel once given. ---
  await page.getByTestId("layover-hotel").fill("Rydges Sydney Central");
  await page.getByTestId("copy-layover-brief").click();
  await expect(page.getByTestId("copy-layover-brief")).toHaveText(/copied/i);

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("SYD");
  expect(copied).toContain("FREE    1d 18h from landing to report");
  expect(copied).toContain("HOTEL   Rydges Sydney Central");
  // Crew ride a company shuttle in — an airport-to-city fare is the wrong question.
  expect(copied).toContain("crew shuttle");
  expect(copied).not.toContain("location unknown");

  // --- It is also there on the day she lands, which does have a duty. ---
  await pickCalendarDay(page, OUT_DAY);
  await expect(page.getByTestId("layover-brief")).toBeVisible();

  // --- And absent once she is home: the day after the return is not a layover. ---
  await pickCalendarDay(page, "2027-05-14");
  await expect(page.getByTestId("layover-brief")).toHaveCount(0);

  await clearRoster(page);
});

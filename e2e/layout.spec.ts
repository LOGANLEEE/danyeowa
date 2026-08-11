import { expect, test } from "@playwright/test";
import { openAddForm, pickCalendarDay } from "./helpers";

/**
 * Layout invariants that unit tests structurally cannot catch, because every one of them is a
 * computed geometry problem in a real engine rather than a rendered-output problem.
 *
 * Each assertion here corresponds to a bug that actually shipped to the user:
 * - the calendar grid rendering narrower than the card below it (three separate times)
 * - a duration label colliding with the times at phone width
 * - a form control under 16px, which makes iOS zoom on focus and wreck the layout
 *
 * All of them passed the unit suite while broken, and the width regression was "fixed" twice by
 * patching the symptom. Measuring is the only thing that has ever caught them.
 */
test.describe("layout invariants at phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("calendar matches its container width, nothing overflows, no control is under 16px", async ({
    page,
  }) => {
    await page.goto("/");

    // --- The empty state: this is the no-upcoming-duty branch, the one that kept regressing.
    // It regressed precisely because it was the branch nobody screenshotted.
    await expect(page.getByTestId("calendar-next")).toBeVisible();
    await expectCalendarMatchesContainer(page, "empty state");
    await expectNoHorizontalOverflow(page, "empty state");

    // --- With the inline add form open on an empty day.
    await openAddForm(page, futureIso(page));
    await expectCalendarMatchesContainer(page, "add form open");
    await expectNoHorizontalOverflow(page, "add form open");

    // Every focusable control must be >=16px or iOS zooms on focus. A Tailwind text-sm on an
    // input beats the global floor in tokens.css, so this can regress from a single class.
    await expectNoTinyControls(page, "add form open");

    // --- With a trip on the day: the board card, then its scroll-expanded timeline.
    await page.getByTestId("flightno-input").fill("412");
    await expect(page.getByTestId("autofill-card")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("day-detail-card").getByRole("button", { name: /add to roster/i }).click();
    await expect(page.getByTestId("delete-trip")).toBeVisible({ timeout: 15_000 });

    await expectCalendarMatchesContainer(page, "trip card shown");
    await expectNoHorizontalOverflow(page, "trip card shown");

    // Scrolling past the collapse threshold expands the duty timeline — the state where the
    // longest strings (station names, "12h 20m airborne") are on screen at once.
    await page.evaluate(() => window.scrollTo(0, 200));
    await expect(page.getByTestId("duty-timeline")).toBeVisible();
    await expectNoHorizontalOverflow(page, "timeline expanded");
    await expectNoTinyControls(page, "timeline expanded");
  });
});

/** The next selectable free day, so the spec never depends on today's date. */
function futureIso(_page: unknown): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 3);
  return d.toISOString().slice(0, 10);
}

/**
 * The calendar grid must be exactly as wide as the column it sits in. It has been narrower three
 * times, always because an ancestor centred its children and a newly-inserted wrapper had no
 * width of its own — so asserting against the container, not a fixed number, is what catches it.
 */
async function expectCalendarMatchesContainer(page: import("@playwright/test").Page, label: string) {
  const widths = await page.evaluate(() => {
    const cell = document.querySelector('[data-testid^="calendar-day-"]');
    if (!cell) return null;
    const grid = cell.closest(".grid-cols-7");
    const container = grid?.closest(".max-w-xl");
    if (!grid || !container) return null;
    return {
      grid: Math.round(grid.getBoundingClientRect().width),
      container: Math.round(container.getBoundingClientRect().width),
    };
  });

  expect(widths, `${label}: calendar grid and container should both be measurable`).not.toBeNull();
  expect(
    Math.abs(widths!.grid - widths!.container),
    `${label}: calendar grid (${widths!.grid}px) should match its container (${widths!.container}px)`,
  ).toBeLessThanOrEqual(1);
}

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label}: page should not scroll horizontally at 390px`).toBeLessThanOrEqual(0);
}

async function expectNoTinyControls(page: import("@playwright/test").Page, label: string) {
  const tiny = await page.evaluate(() =>
    [...document.querySelectorAll("input, select, textarea, button")]
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => {
        const testId = (el as HTMLElement).dataset.testid;
        return `${el.tagName.toLowerCase()}${testId ? `[${testId}]` : ""}=${getComputedStyle(el).fontSize}`;
      }),
  );
  expect(tiny, `${label}: controls under 16px make iOS zoom on focus`).toEqual([]);
}

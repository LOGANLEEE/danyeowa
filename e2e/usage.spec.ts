import { expect, test } from "@playwright/test";
import type { UsageResponse } from "@danyeowa/shared";
import {
  FIXTURE,
  UNKNOWN_FLIGHT_NO,
  expectRosterCount,
  openAddForm,
  signInThroughUi,
} from "./helpers";

/**
 * The owner's /usage page, end to end: a crew account adds one trip through the real form, and
 * the viewer (the suite's shared e2e@local.test, on USAGE_VIEWER_EMAILS in .dev.vars) reads it.
 *
 * The crew side is a throwaway account in its own context, deleted at the end, so its counts are
 * exactly this run's — the shared account has every other spec's events on it.
 */
test("a trip added through the form, and a form she walked away from, show up step by step", async ({
  page,
  browser,
}) => {
  test.slow();

  const ctx = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: { "cf-connecting-ip": "203.0.113.81" },
  });
  const crew = await ctx.newPage();
  await crew.setViewportSize({ width: 390, height: 844 });
  const email = `usage-${Date.now()}@local.test`;
  await signInThroughUi(crew, email);
  await expect(crew.getByTestId("calendar-grid")).toBeVisible({ timeout: 20_000 });

  await openAddForm(crew, "2026-11-10");
  await crew.getByTestId("flightno-input").fill(FIXTURE.flightNo.slice(2));
  await expect(crew.getByTestId("autofill-card")).toBeVisible();
  // Her roster says a different departure than the schedule: one leg corrected by hand.
  // Always a different time from the one shown. A fixed "10:15" stopped being an edit: the save
  // confirms the time to the crowd layer, so the next run's lookup autofilled 10:15 itself.
  const dep = crew.getByTestId("autofill-dep");
  await dep.fill((await dep.inputValue()) === "10:15" ? "10:16" : "10:15");
  await crew.getByRole("button", { name: /add to roster/i }).click();
  await expectRosterCount(crew, 1);

  // A second form: a flight the schedule does not know, then she leaves the app mid-form and
  // comes back, then gives up by tapping another day.
  await openAddForm(crew, "2026-11-12");
  await crew.getByTestId("flightno-input").fill(UNKNOWN_FLIGHT_NO.slice(2));
  await expect(crew.getByTestId("manual-fallback")).toBeVisible();
  // Headless Chrome never makes a page hidden on its own (bringToFront and a minimised window
  // both left visibilityState "visible", measured 2026-10-22), so this sends the event the way
  // the browser does: at document, bubbling, with visibilityState reading "hidden".
  const setVisibility = (state: "hidden" | "visible") =>
    crew.evaluate((s) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => s });
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
    }, state);
  await setVisibility("hidden");
  await crew.waitForTimeout(1500);
  await setVisibility("visible");
  await openAddForm(crew, "2026-11-13");

  // Events flush ~2s after the last one; ask the server rather than guess the timing.
  const crewSummary = async () => {
    const res = await page.request.get("/api/usage");
    expect(res.status()).toBe(200);
    return ((await res.json()) as UsageResponse).users.find((u) => u.email === email);
  };
  await expect
    .poll(async () => (await crewSummary())?.formLeft.closed.lookup_unknown ?? 0, { timeout: 15_000 })
    .toBe(1);
  const summary = (await crewSummary())!;
  expect(summary.funnel.tripSaved.autofill).toBe(1);
  expect(summary.timeEdits).toEqual({ legsEdited: 1, legsAutofilled: 1 });
  expect(summary.missingFlights).toEqual([{ flightNo: UNKNOWN_FLIGHT_NO, unknown: 1, error: 0 }]);
  expect(summary.entries).toEqual({ day: 2 });
  expect(summary.formLeft.hidden).toEqual({ lookup_unknown: 1 });
  expect(summary.forms.map((f) => f.outcome)).toEqual(["left", "saved"]);
  expect(summary.forms[0]!.steps.map((s) => s.label)).toEqual([
    "opened",
    "lookup_unknown",
    "left_hidden",
    "resumed",
    "left_closed",
  ]);
  expect(summary.forms[0]!.steps.find((s) => s.label === "resumed")!.gapMs).toBeGreaterThanOrEqual(1500);
  expect(summary.forms[1]!.steps.map((s) => s.label)).toContain("time_edited");

  // --- The viewer's page ---
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByTestId("tab-settings").click();
  await page.getByRole("link", { name: /usage/i }).click();
  await expect(page).toHaveURL(/\/usage$/);

  const section = page.getByTestId("usage-user").filter({ hasText: email });
  await expect(section.getByTestId("usage-add_form_opened")).toHaveText("2");
  await expect(section.getByTestId("usage-trip_saved")).toHaveText("1");

  // Every value stays on one line at 390px — "1 / 0 / 0" once wrapped to "1 / 0 /" + "0" because
  // the long label beside it squeezed it. Counted as distinct line tops of the text's own rects.
  await expect(section.locator("dd", { hasText: /\d+ \/ \d+ \/ \d+/ })).toHaveCount(1);
  const valueLines = await page.locator('[data-testid="usage-page"] dd').evaluateAll((dds) =>
    dds.map((dd) => {
      const range = document.createRange();
      range.selectNodeContents(dd);
      const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
      return { text: dd.textContent, lines: tops.size };
    }),
  );
  expect(valueLines.filter((v) => v.lines !== 1)).toEqual([]);

  // The new sections render, the timeline included, with every row a full touch target.
  await expect(section.getByTestId(`usage-missing-${UNKNOWN_FLIGHT_NO}`)).toHaveText("1 unknown / 0 error");
  await expect(section.getByTestId("usage-time-edits")).toHaveText("1 / 1");
  await expect(section.getByTestId("usage-entry-day")).toHaveText("2");
  await expect(section.getByTestId("usage-left-lookup_unknown")).toHaveText("1 / 1");
  await expect(section.getByTestId("usage-sitting")).toHaveCount(1);
  await expect(section.getByTestId("usage-form")).toHaveCount(2);
  await expect(section.getByTestId("usage-form").first().getByText("back after")).toBeVisible();
  await expect(section.getByTestId("usage-form-longest")).toHaveCount(2);
  const rowHeights = await section
    .getByTestId("usage-form-step")
    .evaluateAll((rows) => rows.map((r) => r.getBoundingClientRect().height));
  expect(rowHeights.length).toBeGreaterThanOrEqual(10);
  expect(rowHeights.filter((h) => h < 44)).toEqual([]);
  const measured = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  console.log(`usage 390px: ${JSON.stringify(measured)}, dd values ${valueLines.length}, multi-line ${valueLines.filter((v) => v.lines !== 1).length}, step rows ${rowHeights.length}, min row ${Math.min(...rowHeights)}px`);

  // Layout invariants from CLAUDE.md: nothing scrolls sideways at 390px, controls are >=16px.
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  expect(
    await page.locator("select").evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(16);

  // A non-viewer gets nothing: the crew account is not on the list.
  expect((await crew.request.get("/api/usage")).status()).toBe(404);

  // Clean up: deleting the account cascades its trip and its events.
  await crew.getByTestId("tab-settings").click();
  await crew.getByTestId("delete-account").click();
  await crew.getByTestId("delete-account-confirm-input").fill(email);
  await crew.getByTestId("confirm-delete-account").click();
  await expect(crew.getByTestId("marketing")).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => await crewSummary()).toBeUndefined();
  await ctx.close();
});

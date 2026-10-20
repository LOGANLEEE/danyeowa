import { expect, test } from "@playwright/test";
import type { UsageResponse } from "@danyeowa/shared";
import { FIXTURE, expectRosterCount, openAddForm, signInThroughUi } from "./helpers";

/**
 * The owner's /usage page, end to end: a crew account adds one trip through the real form, and
 * the viewer (the suite's shared e2e@local.test, on USAGE_VIEWER_EMAILS in .dev.vars) reads it.
 *
 * The crew side is a throwaway account in its own context, deleted at the end, so its counts are
 * exactly this run's — the shared account has every other spec's events on it.
 */
test("a trip added through the form shows up in the viewer's funnel", async ({ page, browser }) => {
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
  await crew.getByRole("button", { name: /add to roster/i }).click();
  await expectRosterCount(crew, 1);

  // Events flush ~2s after the last one; ask the server rather than guess the timing.
  const crewSummary = async () => {
    const res = await page.request.get("/api/usage");
    expect(res.status()).toBe(200);
    return ((await res.json()) as UsageResponse).users.find((u) => u.email === email);
  };
  await expect
    .poll(async () => (await crewSummary())?.funnel.tripSaved.autofill ?? 0, { timeout: 15_000 })
    .toBe(1);

  // --- The viewer's page ---
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByTestId("tab-settings").click();
  await page.getByRole("link", { name: /usage/i }).click();
  await expect(page).toHaveURL(/\/usage$/);

  const section = page.getByTestId("usage-user").filter({ hasText: email });
  await expect(section.getByTestId("usage-add_form_opened")).toHaveText("1");
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

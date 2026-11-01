import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import { signInThroughUi } from "./helpers";

/**
 * Settings → Notifications: one "tell me when their roster changes" toggle per paired person,
 * nothing at all without a pairing, gone again once the pairing is revoked. Two real accounts,
 * paired through the API the Share tab calls, viewed at phone width.
 *
 * `/api/push/config` is stubbed to `subscribed: true`: the toggles only render for a device that
 * can receive a push, and headless Chromium cannot take a real subscription. Nothing is sent.
 */
test.use({ viewport: { width: 390, height: 844 } });

async function signIn(browser: Browser, ip: string, label: string): Promise<{ page: Page; email: string }> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: { "cf-connecting-ip": ip },
  });
  // Headless Chromium reports "denied", which hides the whole card; no real subscription is taken.
  await context.addInitScript(() =>
    Object.defineProperty(Notification, "permission", { get: () => "granted" }),
  );
  const page = await context.newPage();
  const email = `${label}-${Date.now()}@local.test`;
  await signInThroughUi(page, email);
  await expect(page.getByTestId("calendar-grid")).toBeVisible({ timeout: 20_000 });
  await page.route("**/api/push/config", (route) =>
    route.fulfill({
      json: { publicKey: "x", enabled: true, leadMinutes: 120, arrivalEnabled: true, subscribed: true },
    }),
  );
  return { page, email };
}

async function openSettings(page: Page) {
  await page.reload();
  await page.getByTestId("tab-settings").click();
  await expect(page.getByTestId("settings-view")).toBeVisible();
}

test("roster-change toggles: none without a pairing, one per paired person, gone after revoke", async ({
  browser,
}) => {
  test.slow();
  const a = await signIn(browser, "203.0.113.20", "rp-a");
  const b = await signIn(browser, "203.0.113.21", "rp-b");

  await openSettings(a.page);
  await expect(a.page.getByTestId("arrival-alerts-toggle")).toBeVisible();
  await expect(a.page.getByText(/tell me when their roster changes/i)).toHaveCount(0);

  const invite = await a.page.request.post("/api/crew/invites", { data: { email: b.email } });
  expect(invite.status()).toBe(201);
  const crewOfB = await b.page.request.get("/api/crew");
  const { received } = (await crewOfB.json()) as { received: { id: string }[] };
  const accepted = await b.page.request.post(`/api/crew/invites/${received[0]!.id}/accept`);
  expect(accepted.status()).toBe(200);

  await openSettings(b.page);
  const toggles = b.page.locator('[data-testid^="roster-push-toggle-"]');
  await expect(toggles).toHaveCount(1);
  await expect(toggles.first()).not.toBeChecked();

  await toggles.first().click();
  await expect(toggles.first()).toBeChecked();
  const afterOn = (await (await b.page.request.get("/api/crew")).json()) as {
    members: { notifyRosterChanges: boolean }[];
  };
  expect(afterOn.members.map((m) => m.notifyRosterChanges)).toEqual([true]);

  await openSettings(b.page);
  await expect(toggles.first()).toBeChecked();

  // 390px: no horizontal scroll, row at least 44px tall, control computes to a touch target.
  const overflow = await b.page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const row = await toggles.first().evaluate((el) => el.closest("label")!.getBoundingClientRect().height);
  expect(row).toBeGreaterThanOrEqual(44);
  await b.page.waitForTimeout(1500); // boot splash fade; the screenshot is evidence, not an assertion
  await b.page.screenshot({ path: "test-results/roster-push-390.png", fullPage: true });

  // Revoking ends the watch: the toggle disappears and the server forgets it.
  const members = (await (await b.page.request.get("/api/crew")).json()) as {
    members: { inviteId: string; userId: string }[];
  };
  const revoked = await b.page.request.post(`/api/crew/invites/${members.members[0]!.inviteId}/revoke`);
  expect(revoked.status()).toBe(200);
  await openSettings(b.page);
  await expect(b.page.getByTestId("arrival-alerts-toggle")).toBeVisible();
  await expect(toggles).toHaveCount(0);
  const stale = await b.page.request.put(`/api/crew/${members.members[0]!.userId}/roster-push`, {
    data: { enabled: true },
  });
  expect(stale.status()).toBe(404);
});

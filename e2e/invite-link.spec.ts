import { expect, test } from "@playwright/test";
import { signInThroughUi } from "./helpers";

/**
 * Someone invited but without an account opens the link from their email.
 *
 * Before this they got an anonymous sign-in form — no reason to trust it, no idea an invitation
 * existed. Now they see who invited them and what signing in gets them.
 *
 * The link carries the invite token, so the security property has to be checked, not assumed:
 * the token opens a preview and nothing else. It must not reveal any roster data, and it must
 * not grant access to anyone's schedule.
 */
test("invite link: a signed-out visitor sees who invited them, and the token grants nothing", async ({
  browser,
}) => {
  test.slow(); // a full email-OTP sign-in plus a second context

  // Both contexts are built explicitly, and both matter:
  //   storageState empty — the suite signs in a shared account by default, and a "signed-out
  //     visitor" that inherited it would prove nothing (it fails loudly: no email field).
  //   cf-connecting-ip  — OTP sends are rate limited to 3/min per IP (worker/src/auth.ts), so
  //     two sign-ins from one address eat the budget the rest of the suite is spending.
  //     Cloudflare sets this header at the edge in production and discards what a client sends.
  const inviter = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: { "cf-connecting-ip": "203.0.113.40" },
  });
  const inviterPage = await inviter.newPage();
  const inviterEmail = `inviter-${Date.now()}@local.test`;
  await signInThroughUi(inviterPage, inviterEmail);
  await expect(inviterPage.getByTestId("calendar-grid")).toBeVisible({
    timeout: 20_000,
  });

  const guestEmail = `guest-${Date.now()}@local.test`;
  const created = await inviterPage.request.post("/api/crew/invites", {
    data: { email: guestEmail },
  });
  expect(created.ok()).toBe(true);
  const { token } = (await created.json()) as { token: string };

  // --- A completely fresh browser context: no cookies, no session. ---
  const guest = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: { "cf-connecting-ip": "203.0.113.41" },
  });
  const guestPage = await guest.newPage();
  await guestPage.goto(`/invite/${token}`);

  // Stage one explains before it asks: who invited you, and what you would get. No form yet.
  await expect(guestPage.getByTestId("invite-headline")).toContainText(
    inviterEmail.split("@")[0]!,
  );
  await expect(guestPage.getByLabel(/email/i)).toHaveCount(0);

  // The blurred calendar is invented furniture, and says so. Blur is decoration — a line of CSS
  // removes it — so what protects the roster is that no real data is ever sent here.
  const peek = guestPage.getByTestId("invite-peek");
  await expect(peek).toBeVisible();
  await expect(peek).toContainText(/sample/i);

  // Stage two: the sign-in form, with the masked address and never the full one.
  await guestPage.getByTestId("invite-continue").click();
  const panel = guestPage.getByTestId("invite-preview");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("•");
  await expect(panel).not.toContainText(guestEmail);

  // The token is not a credential: holding it opens nothing.
  expect((await guestPage.request.get("/api/trips")).status()).toBe(401);
  expect((await guestPage.request.get("/api/crew")).status()).toBe(401);

  // --- Signing in from here lands in the app with the invitation waiting. ---
  await signInThroughUi(guestPage, guestEmail);
  await guestPage.goto("/");
  await guestPage.getByTestId("tab-share").click();
  await expect(guestPage.getByTestId("crew-panel")).toContainText(inviterEmail);

  // Re-opening the link now that they are in: no second sign-in, just the way through.
  await guestPage.goto(`/invite/${token}`);
  await expect(guestPage.getByTestId("invite-open-app")).toHaveAttribute(
    "href",
    "/?tab=share",
  );

  await inviter.close();
  await guest.close();
});

/**
 * The dead end this exists to remove: signed in, but as the wrong address.
 *
 * Invites match on the exact address and Google hands over whatever the account carries, so this
 * is easy to land in — and before, the app simply opened with no invitation and no explanation.
 */
test("invite link: a session for a different address is explained, not silently ignored", async ({
  browser,
}) => {
  test.slow();

  const inviter = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: { "cf-connecting-ip": "203.0.113.60" },
  });
  const inviterPage = await inviter.newPage();
  const inviterEmail = `inviter2-${Date.now()}@local.test`;
  await signInThroughUi(inviterPage, inviterEmail);
  await expect(inviterPage.getByTestId("calendar-grid")).toBeVisible({
    timeout: 20_000,
  });

  const invitedEmail = `invited-${Date.now()}@local.test`;
  const created = await inviterPage.request.post("/api/crew/invites", {
    data: { email: invitedEmail },
  });
  expect(created.ok()).toBe(true);
  const { token } = (await created.json()) as { token: string };

  // Somebody else entirely — an account that exists, but was never invited.
  const stranger = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: { "cf-connecting-ip": "203.0.113.61" },
  });
  const strangerPage = await stranger.newPage();
  const strangerEmail = `stranger-${Date.now()}@local.test`;
  await signInThroughUi(strangerPage, strangerEmail);

  await strangerPage.goto(`/invite/${token}`);
  const mismatch = strangerPage.getByTestId("invite-mismatch");
  await expect(mismatch).toBeVisible();
  // Names their own address, keeps the invited one masked, and offers a way out.
  await expect(strangerPage.locator("body")).toContainText(strangerEmail);
  await expect(strangerPage.locator("body")).not.toContainText(invitedEmail);
  await expect(strangerPage.getByTestId("invite-switch-account")).toBeVisible();
  // And it is not the stage-one pitch: they are past that, they are stuck.
  await expect(strangerPage.getByTestId("invite-continue")).toHaveCount(0);

  await inviter.close();
  await stranger.close();
});

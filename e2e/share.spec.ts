import { expect, test } from "@playwright/test";
import { EK412, clearRoster, openAddForm, signOutThroughUi } from "./helpers";

/**
 * Family share lifecycle, end to end against a real `wrangler dev` (local D1):
 *   crew (already signed in via shared storageState, see auth.setup.ts) creates a trip
 *   (EK412 autofill fast path, same fixture roster.spec.ts uses) -> Share tab -> creates a
 *   link labeled "For Mom" -> a cookie-less browser context (no auth at all - the family
 *   member's own browser) opens /share/<token> and sees the crew name, an away trip row, and
 *   the "Home in N days" figure computed from the fixture dates -> back in the crew context,
 *   the link is revoked -> a fresh cookie-less load of the same URL shows the inactive
 *   message -> crew signs out (real UI), landing renders signed-out again.
 *
 * Sends zero OTPs of its own — the whole suite (autofill.spec.ts, roster.spec.ts, this file)
 * shares ONE authenticated session written once by auth.setup.ts, well under better-auth's
 * IP-keyed 3-per-60s rate limit (`worker/src/auth.ts`). Runs after roster.spec.ts, whose own
 * test deletes all its trips before this file's leading cleanup runs, so the two files'
 * same-dated EK412 fixture trips never coexist. This file is the LAST spec file in the run
 * order (autofill -> roster -> share, alphabetical) and is deliberately the only one that
 * calls `signOutThroughUi`: better-auth's sign-out deletes the session server-side, not just
 * the local cookie, so calling it any earlier would invalidate the same shared session every
 * later spec file's storageState-backed context depends on.
 *
 * The created trip's token is captured via a `page.waitForResponse` on the
 * `POST /api/share-links` call itself, not by parsing the UI (navigator.share is absent in
 * headless Chromium and the UI never displays the raw URL outside the clipboard, which
 * Playwright can't reliably read across browser contexts here) - reading the network
 * response is both simpler and more robust than a clipboard-permission dance.
 */
const LABEL = "For Mom";

test("crew shares a link, family views it cookie-less, crew revokes, family sees inactive", async ({
  page,
  browser,
}) => {
  // Already signed in via the shared storageState (auth.setup.ts).
  await page.goto("/");
  await expect(page.getByTestId("tab-calendar")).toBeVisible();
  await clearRoster(page);

  // --- Create a trip via the EK412 autofill fast path (same fixture as roster.spec.ts). ---
  await page.getByTestId("tab-calendar").click();
  await openAddForm(page, EK412.pickedDate);
  await page.getByTestId("flightno-input").fill(EK412.flightNo.slice(2));
  await expect(page.getByTestId("autofill-card")).toBeVisible();
  await page.getByRole("button", { name: /add to roster/i }).click();
  // Save clears the form and the refetch flips the day's detail card to the trip view - no
  // bottom sheet to close.
  await expect(page.getByTestId("delete-trip")).toBeVisible();

  // The fixture trip is in September while this suite runs in real time well before that
  // (today's actual date), so the "away" hero (the plan's "Home in N days" figure) never
  // occurs naturally - the family page's clock is fixed to a moment inside the trip's own
  // away span below. "Now" is pinned to pickedDate itself (the departure day), so the
  // expected days-until-home is computed here (not echoed from the app) exactly as
  // sharedHero.ts's deriveHeroStatus does: whole calendar days from "now" to toIso.
  const FAMILY_NOW_ISO = `${EK412.pickedDate}T12:00:00.000Z`;
  const toMs = Date.parse(`${EK412.spanEndDate}T00:00:00.000Z`);
  const todayMs = Date.parse(`${EK412.pickedDate}T00:00:00.000Z`);
  const expectedDaysUntilHome = Math.round((toMs - todayMs) / (24 * 60 * 60 * 1000));

  // --- Share tab: create a labeled link, capture its token from the create response. ---
  await page.getByTestId("tab-share").click();
  await page.getByTestId("create-link").click();
  await page.getByLabel(/label/i).fill(LABEL);
  const [createResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/share-links") && r.request().method() === "POST"),
    page.getByTestId("confirm-create-link").click(),
  ]);
  const created = (await createResponse.json()) as { id: string; token: string };
  expect(created.token).toBeTruthy();

  // New links are prepended (ShareView.tsx: `setLinks(prev => [link, ...prev])`), so the
  // just-created link is always the first row - selecting by label alone would collide with
  // a same-labeled row left over (revoked, but still shown) from a prior run of this spec.
  const linkRow = page.getByTestId("link-row").first();
  await expect(linkRow).toContainText(LABEL);

  const shareUrl = `/share/${created.token}`;

  // --- Family: a fresh, cookie-less browser context opens the link. No app chrome, no auth.
  // Its clock is fixed to FAMILY_NOW_ISO (inside the fixture trip's away span) so the "away"
  // hero renders deterministically regardless of the real date the suite runs on. ---
  const familyContext = await browser.newContext();
  const familyPage = await familyContext.newPage();
  await familyPage.clock.install({ time: new Date(FAMILY_NOW_ISO) });
  await familyPage.goto(shareUrl);

  // A fresh OTP-only e2e sign-in never sets a display name, so better-auth's email-OTP
  // route defaults `user.name` to "" - deriveCrewName (worker/src/share.ts) falls back to
  // "Your crew member" for a falsy name, which is what the header renders here.
  await expect(familyPage.getByText(/your crew member's schedule/i)).toBeVisible();
  const hero = familyPage.getByTestId("shared-hero");
  await expect(hero).toBeVisible();
  await expect(hero).toHaveText(new RegExp(String(expectedDaysUntilHome)));

  const tripRow = familyPage.getByTestId("shared-trip-row").first();
  await expect(tripRow).toBeVisible();

  await familyContext.close();

  // --- Crew revokes the link. ---
  await page.getByTestId("tab-share").click();
  await linkRow.getByTestId("revoke-link").click();
  await linkRow.getByTestId("confirm-revoke").click();
  await expect(linkRow).toContainText(/revoked/i);

  // --- Family: a fresh cookie-less load of the same URL now shows the inactive message. ---
  const familyContext2 = await browser.newContext();
  const familyPage2 = await familyContext2.newPage();
  await familyPage2.goto(shareUrl);
  await expect(familyPage2.getByTestId("shared-inactive")).toBeVisible();
  await expect(familyPage2.getByTestId("shared-hero")).not.toBeVisible();
  await familyContext2.close();

  // --- Cleanup: delete the trip. ---
  await clearRoster(page);
  await expect(page.getByText(/no trips yet/i)).toBeVisible();

  // --- Sign out (real UI) -> back to landing. Safe here because this is the last spec file
  // in the run order — no later file depends on the shared session staying valid. ---
  await signOutThroughUi(page);
  await expect(page.getByRole("heading", { name: /roaster/i, level: 1 })).toBeVisible();
  // Single-surface landing: email field is inline, no separate "Sign in" CTA to navigate through.
  await expect(page.getByLabel(/email/i)).toBeVisible();
});

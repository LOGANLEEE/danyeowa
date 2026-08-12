/**
 * Calendar swipe, measured in a real engine. Run against a locally built server (`pnpm dev`):
 *
 *     node web/verify-swipe.mjs
 *
 * Everything here is geometry or a computed style, which is exactly what the unit suite cannot
 * see: jsdom reports every element as 0x0, runs no CSS transitions, and implements neither
 * `inert` nor `touch-action`. It exits non-zero on the first broken invariant.
 *
 * The bug this caught on the way in: the track's own box is one panel wide, not three (its
 * panels overflow it), so a `-33.3333%` base parked the calendar two thirds of a panel off and
 * showed mostly the previous month. Every unit test still passed.
 */
import { chromium, devices } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:8787";
const SETTLE_MS = 400; // the 320ms settle plus a frame or two

const failures = [];
function check(label, actual, expected) {
  const ok = typeof expected === "function" ? expected(actual) : Object.is(actual, expected);
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${JSON.stringify(actual)}`);
  if (!ok) failures.push(label);
}

const browser = await chromium.launch();
const page = await (
  await browser.newContext({ ...devices["iPhone 13"], isMobile: false, hasTouch: false })
).newPage();

await page.goto(BASE + "/");
await page.getByLabel(/email/i).fill("logan@example.com");
await page.getByRole("button", { name: /send code/i }).click();
const code = page.getByLabel(/code/i);
await code.waitFor();
await code.fill("123123");
await page.getByRole("button", { name: /^sign in$/i }).click();

const grid = page.getByTestId("calendar-grid");
await grid.waitFor({ timeout: 20_000 });
const track = page.locator('[data-testid="calendar-grid"] > div');
const month = () => page.getByTestId("calendar-month").innerText();
/** Committed horizontal translate in px — the whole point is that it moves *during* a drag. */
const translateX = async () => {
  const matrix = await track.evaluate((el) => getComputedStyle(el).transform);
  return matrix === "none" ? 0 : Math.round(parseFloat(matrix.split(",")[4]));
};

const box = await grid.boundingBox();
const cy = box.y + box.height / 2;
const panel = Math.round(box.width);

async function drag(fromX, dx, { release = true, dy = 0 } = {}) {
  await page.mouse.move(fromX, cy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(fromX + (dx * i) / 8, cy + (dy * i) / 8);
  if (release) {
    await page.mouse.up();
    await page.waitForTimeout(SETTLE_MS);
  }
}

// Centred means exactly one panel of travel: the middle of three.
check("rests centred on the current month", await translateX(), -panel);
const startMonth = await month();

// 1. The track follows the finger, mid-gesture, before any release.
await drag(box.x + box.width - 30, -100, { release: false });
check("follows the finger mid-drag", await translateX(), -panel - 100);
check("keeps the month until release", await month(), startMonth);
await page.mouse.up();
await page.waitForTimeout(SETTLE_MS);
check("swipe left advances a month", await month(), (m) => m !== startMonth);
check("settles back to centre after the swipe", await translateX(), -panel);

// 2. And back.
await drag(box.x + 30, 100);
check("swipe right returns", await month(), startMonth);
check("settles back to centre after returning", await translateX(), -panel);

// 3. Under the 50px threshold: glides back, month unchanged.
await drag(box.x + box.width - 30, -30);
check("short drag keeps the month", await month(), startMonth);
check("short drag glides back to centre", await translateX(), -panel);

// 4. Mostly-vertical drag is page-scroll intent, not a swipe.
await drag(box.x + box.width / 2, 60, { dy: 120 });
check("vertical drag keeps the month", await month(), startMonth);

// 5. The arrows travel the same way — caught mid-flight, before the settle lands.
await page.getByTestId("calendar-next").click();
await page.waitForTimeout(60);
check("arrow animates rather than jumping", await translateX(), (x) => x !== -panel);
await page.waitForTimeout(SETTLE_MS);
check("arrow settles centred", await translateX(), -panel);
await page.getByTestId("calendar-prev").click();
await page.waitForTimeout(SETTLE_MS);
check("arrow returns to the start month", await month(), startMonth);

// 6. Structure: three panels, neighbours genuinely inert (jsdom can only see the attribute).
check(
  "renders prev/current/next, neighbours inert",
  await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="calendar-grid"] .grid-cols-7')].map((p) => p.inert),
  ),
  (v) => v.length === 3 && v[0] === true && v[1] === false && v[2] === true,
);

// 7. The invariants a carousel is most likely to break: the recurring width regression, and
// horizontal page scroll at phone width (the track overflows its viewport by design).
check(
  "grid still matches its container, nothing scrolls sideways",
  await page.evaluate(() => {
    const cell = document.querySelector('[data-testid^="calendar-day-"]');
    const grid = cell?.closest(".grid-cols-7");
    const container = grid?.closest(".max-w-xl");
    return {
      delta: Math.abs(
        Math.round(grid.getBoundingClientRect().width - container.getBoundingClientRect().width),
      ),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  }),
  (v) => v.delta <= 1 && v.overflowX === 0,
);

// 8. A tap must still select a day; a swipe ending over one must not (covered in the unit suite,
// but the click-cancel runs off a real click here).
const day = page.locator('[data-testid^="calendar-day-"]:not([disabled])').nth(10);
const dayId = await day.getAttribute("data-testid");
await day.click();
check(
  "a tap still selects a day",
  await page.locator(`[data-testid="${dayId}"]`).getAttribute("aria-pressed"),
  "true",
);

await browser.close();
console.log(
  failures.length ? `\n${failures.length} FAILED: ${failures.join(", ")}` : "\nall swipe invariants hold",
);
process.exit(failures.length ? 1 : 0);

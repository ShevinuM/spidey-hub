// Cold-boot coverage for surfaces the shared `context` fixture's boot-seen
// pre-seed otherwise hides: a real first-time visitor's bell/ring state and
// the dashboard's first-paint chrome, exercised together with a genuine
// (non-skipped) boot.
//
// Does not re-cover notifications-boot.spec.ts's own subject (a toast
// surviving the boot overlay).
//
// Deliberately imports the RAW `@playwright/test`, not the shared fixture:
// that fixture pre-seeds the boot-seen flag specifically so boot never runs
// during every OTHER spec's tests.
import { expect, test, type Page } from "@playwright/test";

// Hand-mirrored from content/boot.yaml / BootSequence.svelte — no runtime
// import of the yaml is possible from a Playwright-only module.
const BOOT_MS = 4600;
const HARD_STOP_MS = BOOT_MS + 60;
const OUT_MS = 760;

const CLOCK_TIME = "2026-08-15T23:34:00";

const BOOT_SEQUENCE = '[data-testid="boot-sequence"]';
const BELL = '[data-testid="notifications-bell"]';
const SENSE_RING = '[data-testid="notifications-sense-ring"]';

async function terminalReady(page: Page) {
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

/** Fresh context, fake clock installed before navigation, no sessionStorage
 * flag pre-seeded — a genuine first-load boot plays, then fast-forwarded
 * through in full (main sequence + outro hold). */
async function coldBootToReady(page: Page) {
  await page.route("**/api.github.com/**", (route) => route.abort());
  await page.clock.install({ time: CLOCK_TIME });
  await page.goto("/");
  await terminalReady(page);
  await page.locator(`${BOOT_SEQUENCE}[data-boot-running="true"]`).waitFor({ state: "attached" });
  await page.clock.runFor(HARD_STOP_MS + OUT_MS + 100);
  await expect(page.locator(BOOT_SEQUENCE)).toHaveCount(0);
}

test.describe("cold boot: unread bell + senseRing ring", () => {
  // Severity/read-state of the two injected pool entries is not seeded
  // here (same "no seed pinned, run repeatedly" reasoning
  // notifications-boot.spec.ts uses) — a fresh visit always injects 2
  // unseen entries, so the bell is unread regardless of which 2 land.
  for (let i = 1; i <= 3; i++) {
    test(`run ${i}: bell shows unread and its ring is a live animation once boot clears`, async ({
      page,
    }) => {
      await coldBootToReady(page);

      const bell = page.locator(BELL);
      await expect(bell).toBeVisible();
      const unreadCount = await bell.getAttribute("data-unread-count");
      expect(Number(unreadCount)).toBeGreaterThan(0);

      const ring = page.locator(SENSE_RING);
      await expect(ring).toBeVisible();

      // `getComputedStyle().animationName` reports a name whether or not it
      // resolves to a live `@keyframes` rule; `getAnimations().length > 0`
      // is the safe check here since `senseRing` is declared `infinite`.
      const liveCount = await ring.evaluate((el) => (el as HTMLElement).getAnimations().length);
      expect(liveCount).toBeGreaterThan(0);
    });
  }
});

test.describe("cold boot: first paint is a real, interactive dashboard", () => {
  test("boot clears into the dashboard chrome — wordmark, status bar, and window switching all work", async ({
    page,
  }) => {
    await coldBootToReady(page);

    await expect(page.locator('[data-testid="dashboard-wordmark"]')).toBeVisible();
    await expect(page.locator('[data-testid="status-bar-windows"]')).toBeVisible();

    // Not a blank/frozen frame: the keydown listener is live immediately.
    await page.keyboard.down("Control");
    await page.keyboard.press("b");
    await page.keyboard.up("Control");
    await page.keyboard.press("1");
    await expect(page).toHaveURL(/\/repositories$/);
  });
});

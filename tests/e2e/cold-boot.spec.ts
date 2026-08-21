// Cold-boot coverage for the surfaces PLAN.md Phase 7.2 calls out as still
// untested from both directions even after tests/e2e/notifications-boot.spec.ts
// landed: `tests/e2e/fixtures.ts`'s shared `context` fixture pre-seeds the
// boot-seen sessionStorage flag for every spec except `boot.spec.ts`, and
// `boot.spec.ts` itself never mentions notifications — so a real first-time
// visitor's bell/ring state and the dashboard's basic first-paint chrome
// were never exercised together with a genuine (non-skipped) boot.
//
// Deliberately does NOT re-cover notifications-boot.spec.ts's own subject
// (a toast surviving the boot overlay) — see that file for the toast/drain
// assertions. This file covers the OTHER cold-boot surfaces: the unread
// bell + its `senseRing` ring (PLAN.md F1's defect 1 — the ring was
// entirely dead until `b885c18`, and nothing here would have caught a
// regression back to that state without this spec), and first-paint
// sanity (boot actually clears, and the dashboard chrome it hands off to
// is real, not a blank/broken frame).
//
// Deliberately imports the RAW `@playwright/test` (not ./fixtures.ts),
// same reason boot.spec.ts and notifications-boot.spec.ts do: the shared
// `context` fixture pre-seeds the boot-seen flag specifically so boot
// never runs during every OTHER spec's tests.
import { expect, test, type Page } from "@playwright/test";

// Hand-mirrored from src/data/boot.yaml / BootSequence.svelte — same
// convention boot.spec.ts and notifications-boot.spec.ts already use (no
// runtime import of the yaml is possible from a Playwright-only module).
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
 * through in full (main sequence + outro hold), same contract as
 * boot.spec.ts's `freshBoot` / notifications-boot.spec.ts's own copy. */
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
    test(`run ${i}: bell shows unread and its ring is a live animation once boot clears`, async ({ page }) => {
      await coldBootToReady(page);

      const bell = page.locator(BELL);
      await expect(bell).toBeVisible();
      const unreadCount = await bell.getAttribute("data-unread-count");
      expect(Number(unreadCount)).toBeGreaterThan(0);

      const ring = page.locator(SENSE_RING);
      await expect(ring).toBeVisible();

      // `getComputedStyle().animationName` reports a dead reference as a
      // non-"none" string just as readily as a live one (PLAN.md F1) — the
      // discriminating check is `getAnimations().length > 0`, safe here
      // specifically because `senseRing` is declared `infinite`
      // (tests/e2e/animations.spec.ts's header comment on why this check
      // is unsafe for one-shot animations does not apply to this element).
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

    // Not a blank/frozen frame: the keydown listener is live immediately,
    // the same property BootSequence's own "unskippable" tests confirm is
    // absent DURING boot (tests/e2e/boot.spec.ts) — here confirming the
    // mirror-image is true once boot has actually finished.
    await page.keyboard.down("Control");
    await page.keyboard.press("b");
    await page.keyboard.up("Control");
    await page.keyboard.press("1");
    await expect(page).toHaveURL(/\/repositories$/);
  });
});

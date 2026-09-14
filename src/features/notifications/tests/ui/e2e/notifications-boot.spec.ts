// Uses the raw @playwright/test `test`, not the shared fixtures' wrapped one, whose
// `context` pre-seeds the boot-skip key — these specs need a real boot to play. Only
// the key constant comes from that shared module.
import { expect, test, type Page } from "@playwright/test";
import { BOOT_SEEN_STORAGE_KEY } from "../../../../../common/tests/ui/support/fixtures";
import { TOAST_DURATION_MS } from "../../../lib/notification-store";

// Hand-mirrored from src/features/boot/content/boot.yaml, since this
// Playwright-only module can't import the yaml at runtime.
const BOOT_MS = 4600;
const HARD_STOP_MS = BOOT_MS + 60;
const OUT_MS = 760;

const CLOCK_TIME = "2026-08-15T23:34:00";

const BOOT_SEQUENCE = '[data-testid="boot-sequence"]';

async function terminalReady(page: Page) {
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

const toasts = (page: Page) => page.locator('[data-testid="toast"]');

/** Installs a fake clock before navigation with no sessionStorage flag pre-seeded, so a genuine first-load boot plays. */
async function freshBoot(page: Page, path = "/") {
  await page.clock.install({ time: CLOCK_TIME });
  await page.goto(path);
  await terminalReady(page);
  await page.locator(`${BOOT_SEQUENCE}[data-boot-running="true"]`).waitFor({ state: "attached" });
}

/** True once at least one toast's drain bar is actually mid-countdown (progress under 1), using `getAnimations()` rather than `animationName` since a dead keyframe reference can still report a name while resolving to no animation. */
async function hasLiveDrainingToast(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const bars = document.querySelectorAll('[data-testid="toast"] .eh-toast-drain');
    for (const bar of bars) {
      const anims = (bar as HTMLElement).getAnimations();
      for (const anim of anims) {
        const progress = anim.effect?.getComputedTiming().progress;
        if (typeof progress === "number" && progress < 1) return true;
      }
    }
    return false;
  });
}

test.describe("cold boot: toasts survive the boot overlay", () => {
  // Severity (and duration) is drawn randomly per visit with no seed
  // pre-set, so 5 independent runs cover the info/warn/alert mix.
  for (let i = 1; i <= 5; i++) {
    test(`run ${i}: at least one toast is visible and still counting down once boot clears`, async ({ page }) => {
      await page.route("**/api.github.com/**", (route) => route.abort());
      await freshBoot(page);

      // Fast-forward through the ENTIRE unskippable boot sequence
      // (main + outro hold) in virtual time — no real toast timer can have
      // fired yet, since none was ever armed while boot was active.
      await page.clock.runFor(HARD_STOP_MS + OUT_MS + 100);
      await expect(page.locator(BOOT_SEQUENCE)).toHaveCount(0);

      // A fresh visit always injects 2 unseen pool entries (30 real content
      // entries, never exhausted on a first visit), so both toasts should
      // now be visible and freshly armed.
      await expect(toasts(page)).toHaveCount(2);
      await expect.poll(() => hasLiveDrainingToast(page)).toBe(true);
    });
  }
});

test.describe("returning visitor: boot-seen already set", () => {
  test("toasts still arm immediately and auto-dismiss on their normal schedule (no-op gate)", async ({ page }) => {
    await page.route("**/api.github.com/**", (route) => route.abort());
    await page.addInitScript((key) => {
      try {
        sessionStorage.setItem(key, "1");
      } catch {
        /* ignore */
      }
    }, BOOT_SEEN_STORAGE_KEY);
    await page.clock.install({ time: CLOCK_TIME });
    await page.goto("/");
    await terminalReady(page);

    // Boot never runs at all — the common case this gate must not disturb.
    await expect(page.locator(BOOT_SEQUENCE)).toHaveCount(0);
    await expect(toasts(page)).toHaveCount(2);
    await expect.poll(() => hasLiveDrainingToast(page)).toBe(true);

    await page.clock.runFor(TOAST_DURATION_MS.alert + 200);
    await expect(toasts(page)).toHaveCount(0);
  });
});

// Regression suite for the boot/toast race (PLAN.md Phase 5, F2): a toast
// spawned on a fresh visit used to arm its auto-dismiss countdown the
// instant it mounted, with no awareness that BootSequence.svelte's opaque
// ~5.36s overlay (src/data/boot.yaml's `bootMs` + BootSequence's own
// `OUT_MS`) was still hiding it — an info (3s) or warn (5s) toast could
// fully expire before the visitor ever saw the dashboard.
//
// Deliberately imports the RAW `@playwright/test` (not ./fixtures.ts), same
// reason tests/e2e/boot.spec.ts does: the shared `context` fixture
// pre-seeds the boot-seen sessionStorage flag for every other spec
// specifically so boot never runs during THEIR tests — this file exists to
// exercise the real first-visit interaction between boot and toasts, which
// no other spec covers from either direction.
//
// Uses `page.clock` (Playwright's fake-timer API) so a run costs no real
// wall-clock time and the boot phase transition is deterministic, matching
// boot.spec.ts's own "outro bloom" test.
import { expect, test, type Page } from "@playwright/test";
import { BOOT_SEEN_STORAGE_KEY } from "../../src/features/boot/lib/boot-state.ts";
import { TOAST_DURATION_MS } from "../../src/lib/notificationStore.ts";

// Hand-mirrored from src/data/boot.yaml / BootSequence.svelte, same
// convention boot.spec.ts already uses (no runtime import of the yaml is
// possible from this Playwright-only module).
const BOOT_MS = 4600;
const HARD_STOP_MS = BOOT_MS + 60;
const OUT_MS = 760;

const CLOCK_TIME = "2026-08-15T23:34:00";

const BOOT_SEQUENCE = '[data-testid="boot-sequence"]';

async function terminalReady(page: Page) {
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

const toasts = (page: Page) => page.locator('[data-testid="toast"]');

/** Fresh context, fake clock installed before navigation, no sessionStorage
 * flag pre-seeded — a genuine first-load boot plays, same contract as
 * boot.spec.ts's own `freshBoot`. */
async function freshBoot(page: Page, path = "/") {
  await page.clock.install({ time: CLOCK_TIME });
  await page.goto(path);
  await terminalReady(page);
  await page.locator(`${BOOT_SEQUENCE}[data-boot-running="true"]`).waitFor({ state: "attached" });
}

/** True once at least one toast's `.eh-toast-drain` bar is actually
 * animating with progress still under 1 — i.e. the toast is not merely
 * present in the DOM but genuinely mid-countdown, not a bar that happened
 * to render on the very frame it finished. `getAnimations()` (not
 * `animationName`) is deliberate: PLAN.md's F1 finding is that a dead
 * keyframe still reports a non-"none" `animationName` while resolving to no
 * animation at all — `drain` is declared inside ToastStack's own `<style>`
 * block (Svelte rewrites both sides), so it is one of the animations F1
 * confirms actually runs, making this a reliable liveness check here. */
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
  // Severity (and therefore duration) is drawn randomly per visit
  // (src/lib/notificationStore.ts's `injectVisit`/`pickRandomUnseen`, no
  // seed pre-set here on purpose) — 5 independent runs cover the info/warn/
  // alert mix rather than pinning one lucky draw.
  for (let i = 1; i <= 5; i++) {
    test(`run ${i}: at least one toast is visible and still counting down once boot clears`, async ({ page }) => {
      await page.route("**/api.github.com/**", (route) => route.abort());
      await freshBoot(page);

      // Fast-forward through the ENTIRE unskippable boot sequence
      // (main + outro hold) in virtual time — no real toast timer can have
      // fired yet, since none was ever armed while boot was active.
      await page.clock.runFor(HARD_STOP_MS + OUT_MS + 100);
      await expect(page.locator(BOOT_SEQUENCE)).toHaveCount(0);

      // A fresh visit always injects 2 unseen pool entries (30 real
      // src/content/notifications entries, never exhausted on a first
      // visit), so both toasts should now be visible and freshly armed.
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

    // Advance past the longest possible severity duration (alert, 10s): if
    // the boot-active gate ever failed to no-op when boot never ran, the
    // timer would never have armed and the toasts would still be sitting
    // here unchanged. Seeing them clear proves the countdown started right
    // on mount, exactly as before this fix.
    await page.clock.runFor(TOAST_DURATION_MS.alert + 200);
    await expect(toasts(page)).toHaveCount(0);
  });
});

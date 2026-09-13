import { expect, test, type Page } from "@playwright/test";
import { BOOT_SEEN_STORAGE_KEY } from "../../../../boot/lib/boot-state";
import { TOAST_DURATION_MS, type NotificationSeverity } from "../../../lib/notification-store";

const BOOT_SEQUENCE = '[data-testid="boot-sequence"]';

async function terminalReady(page: Page) {
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

interface RevealSample {
  id: string;
  sev: NotificationSeverity;
  /** `.eh-toast-drain` bar width as a fraction of its track's width: 1 is full, 0 is drained. */
  drainFrac: number;
  /** Progress of the toast's `toastIn` entrance animation, or `null` if it never started; `both` fill mode reports a finished entrance as progress 1, not absent. */
  toastInProgress: number | null;
}

/** Polls via rAF for the boot overlay to leave the DOM, then samples every toast's drain fraction and `toastIn` progress in one `page.evaluate` round trip so both are captured in the same reveal frame. */
async function captureRevealMoment(page: Page): Promise<RevealSample[]> {
  return page.evaluate(() => {
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return (async () => {
      while (document.querySelector('[data-testid="boot-sequence"]')) {
        await frame();
      }
      // One more frame so the style recalc triggered by the overlay's
      // removal has actually applied and the browser has (re)created any
      // animations whose resolved `animation-name` just changed.
      await frame();

      const toastEls = Array.from(document.querySelectorAll('[data-testid="toast"]'));
      return toastEls.map((toastEl) => {
        const id = toastEl.getAttribute("data-toast-id") ?? "";
        // Cast, not the imported `NotificationSeverity` union: this
        // closure is stringified and run inside the page, so it must stay
        // pure browser code — the caller re-asserts the real type on the
        // way back out (see `RevealSample`).
        const sev = (toastEl.getAttribute("data-severity") ?? "") as RevealSample["sev"];
        const bar = toastEl.querySelector(".eh-toast-drain") as HTMLElement | null;
        const track = bar?.parentElement as HTMLElement | null;
        const barW = bar?.getBoundingClientRect().width ?? 0;
        const trackW = track?.getBoundingClientRect().width ?? 0;
        const drainFrac = trackW > 0 ? barW / trackW : 0;

        const anims = (toastEl as HTMLElement).getAnimations();
        // `animationName` lives on the `CSSAnimation` subtype, not the
        // base `Animation` the DOM lib types `getAnimations()` as.
        const toastInAnim = anims.find((a) => (a as unknown as { animationName?: string }).animationName === "toastIn");
        const toastInProgress = toastInAnim?.effect?.getComputedTiming().progress ?? null;

        return { id, sev, drainFrac, toastInProgress };
      });
    })();
  });
}

test.describe("cold boot: the whole toast reveal (entrance + drain) starts when the toast becomes visible", () => {
  test("toastIn has not already finished and the drain bar is near-full at the moment boot clears, then the bar decreases", async ({
    page,
  }) => {
    await page.route("**/api.github.com/**", (route) => route.abort());

    // No sessionStorage flag pre-seeded, so a genuine first-load boot plays.
    await page.goto("/");
    await terminalReady(page);
    await page.locator(`${BOOT_SEQUENCE}[data-boot-running="true"]`).waitFor({ state: "attached" });

    const revealed = await captureRevealMoment(page);

    // A fresh visit always injects 2 unseen pool entries (30 real content
    // entries, never exhausted on a first visit), so both toasts should be
    // visible right at reveal.
    expect(revealed.length).toBe(2);

    for (const sample of revealed) {
      expect.soft(sample.toastInProgress, `toastIn progress for toast ${sample.id}`).not.toBeNull();
      expect.soft(sample.toastInProgress ?? 1, `toastIn progress for toast ${sample.id}`).toBeLessThan(1);
      expect.soft(sample.drainFrac, `drain fraction for toast ${sample.id}`).toBeGreaterThan(0.75);
    }

    const waitMs = 1200;
    await page.waitForTimeout(waitMs);

    const toasts = page.locator('[data-testid="toast"]');
    await expect(toasts).toHaveCount(2);
    const after = await captureRevealMoment(page);

    for (const before of revealed) {
      const post = after.find((s) => s.id === before.id);
      expect(post, `toast ${before.id} still present after ${waitMs}ms`).toBeDefined();
      const decrease = before.drainFrac - (post as RevealSample).drainFrac;
      const expectedDecrease = waitMs / TOAST_DURATION_MS[before.sev];
      // Tolerant of arm/measurement jitter: well short of the full expected decrease, but well above no movement at all.
      expect(decrease, `drain decrease for toast ${before.id} (sev ${before.sev})`).toBeGreaterThan(expectedDecrease * 0.6);
    }
  });
});

test.describe("returning visitor: boot-seen already set", () => {
  test("toastIn plays immediately — the boot gate must not delay the common case", async ({ page }) => {
    await page.route("**/api.github.com/**", (route) => route.abort());
    await page.addInitScript((key) => {
      try {
        sessionStorage.setItem(key, "1");
      } catch {
        /* ignore */
      }
    }, BOOT_SEEN_STORAGE_KEY);

    await page.goto("/");
    await terminalReady(page);

    // Boot never runs at all — the common case this gate must not disturb.
    await expect(page.locator(BOOT_SEQUENCE)).toHaveCount(0);
    await expect(page.locator('[data-testid="toast"]')).toHaveCount(2);

    const sample = await page.evaluate(() => {
      const toastEl = document.querySelector('[data-testid="toast"]') as HTMLElement | null;
      const anims = toastEl?.getAnimations() ?? [];
      const toastInAnim = anims.find((a) => (a as unknown as { animationName?: string }).animationName === "toastIn");
      return toastInAnim?.effect?.getComputedTiming().progress ?? null;
    });

    expect(sample, "toastIn must have actually run for a returning visitor").not.toBeNull();
  });
});

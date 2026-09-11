// Regression test for PLAN.md Phase 5b (widened mid-task by the
// orchestrator from "just the drain bar" to the whole toast reveal
// lifecycle — see the commit this test ships with): `toastIn` (entrance),
// `strand` (the little vertical tick above a toast), and `drain` (the
// countdown bar) all start their CSS animation the instant the toast div
// MOUNTS, not when it actually becomes VISIBLE. A toast injected on a cold
// visit mounts well before BootSequence.svelte's opaque ~5.36s overlay
// (`bootMs` 4600 + `OUT_MS` 760) lifts, so by reveal time:
//   - `toastIn` (.34s) and `strand` (.3s) have long since finished (their
//     `both` fill mode keeps them "in effect", just sitting at their END
//     state) — no entrance is ever seen.
//   - `drain` (duration = the toast's own severity-scaled dismiss timer,
//     info 3000ms shortest) is fully or mostly drained, sometimes to 0%,
//     well before the visitor can look at it.
//
// Deliberately imports the RAW `@playwright/test` (not ./fixtures.ts), same
// reason tests/e2e/boot.spec.ts and tests/e2e/notifications-boot.spec.ts
// do: the shared `context` fixture pre-seeds the boot-seen sessionStorage
// flag for every other spec specifically so boot never runs during THEIR
// tests — this file needs the real, unskipped boot.
//
// Deliberately does NOT use `page.clock`: Playwright's fake-timer API only
// mocks JS-visible time (Date/setTimeout/rAF timing sources it controls) —
// it does not accelerate the browser's own CSS-animation clock, which is
// compositor-driven. Fast-forwarding boot's `isActive()` gate via
// `page.clock.runFor()` (as notifications-boot.spec.ts does) makes boot
// disappear within milliseconds of REAL wall-clock time, leaving no real
// mount-to-reveal gap for this bug to manifest in. Reproducing it requires
// actually waiting out boot's real ~5.36s overlay — this test does, and
// does not scale toast durations either, for the same reason: the point is
// to observe real-time behavior across the real boot gap.
import { expect, test, type Page } from "@playwright/test";
import { BOOT_SEEN_STORAGE_KEY } from "../../../../boot/lib/boot-state";
import { TOAST_DURATION_MS, type NotificationSeverity } from "../../../../../lib/notificationStore";

const BOOT_SEQUENCE = '[data-testid="boot-sequence"]';

async function terminalReady(page: Page) {
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

interface RevealSample {
  id: string;
  sev: NotificationSeverity;
  /** `.eh-toast-drain` bar width as a fraction of its own track's width —
   * 1 means "full, not yet drained", 0 means "fully drained". */
  drainFrac: number;
  /** `getComputedTiming().progress` of the toast's own `toastIn` entrance
   * animation (`-global-toastIn`, so the literal `animationName` — Phase 1
   * made it global specifically so the inline `animation:` reference in
   * this component's markup resolves), or `null` if the browser reports no
   * such animation on the element at all (never started). `both` fill mode
   * means a FINISHED entrance animation is still "in effect" and still
   * returned here, at progress 1 — this is what lets the assertion tell
   * "already played out" apart from "genuinely running". */
  toastInProgress: number | null;
}

/** Waits (via rAF polling, not a fixed sleep) for the boot overlay to
 * leave the DOM, then samples every visible toast's drain-bar fraction and
 * `toastIn` progress in one atomic `page.evaluate` round trip — capturing
 * both in the SAME frame the reveal happens, rather than racing a
 * multi-step Playwright-side poll (`toHaveCount(0)` etc.) against
 * `toastIn`'s own short 340ms lifetime. */
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

    // No sessionStorage flag pre-seeded — a genuine first-load boot plays,
    // same contract as boot.spec.ts's/notifications-boot.spec.ts's own
    // `freshBoot` helpers (not reused directly since neither installs
    // `page.clock`, which this test must avoid).
    await page.goto("/");
    await terminalReady(page);
    await page.locator(`${BOOT_SEQUENCE}[data-boot-running="true"]`).waitFor({ state: "attached" });

    const revealed = await captureRevealMoment(page);

    // A fresh visit always injects 2 unseen pool entries (30 real
    // src/content/notifications entries, never exhausted on a first
    // visit), so both toasts should be visible right at reveal.
    expect(revealed.length).toBe(2);

    for (const sample of revealed) {
      // The bug: a mount-started `toastIn` (.34s, `both` fill) has long
      // since finished by the time boot's ~5.36s overlay clears — reads
      // progress 1 at HEAD, regardless of severity. Fixed: it has just
      // started (or not yet been sampled past its own first frame),
      // reading well under 1.
      expect.soft(sample.toastInProgress, `toastIn progress for toast ${sample.id}`).not.toBeNull();
      expect.soft(sample.toastInProgress ?? 1, `toastIn progress for toast ${sample.id}`).toBeLessThan(1);

      // The bug: a mount-started, severity-scaled `drain` bar (info:
      // 3000ms shortest) has already run down substantially — often to
      // 0% — by the time boot's overlay clears. Fixed: the bar has only
      // just started counting down from when it became visible.
      expect.soft(sample.drainFrac, `drain fraction for toast ${sample.id}`).toBeGreaterThan(0.75);
    }

    // Liveness check, not a HEAD-discriminator on its own (a short enough
    // wait could pass even against the bug for a long-duration severity) —
    // confirms the bar is a genuinely running countdown, not merely
    // reading a lucky static value at the moment of the first sample.
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
      // Tolerant of arm/measurement jitter — well short of the full
      // expected decrease, but well above "no movement at all" (which is
      // what a bar that was already-drained-and-static at first sample,
      // i.e. the bug, would show here too).
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

    // Not asserting a tight progress window here (unlike the cold-boot
    // test above): with no boot overlay to wait out, the only latency
    // between mount and this sample is ordinary page hydration, which is
    // not bounded by anything this fix controls and would make a tight
    // window flaky. The regression this guards against is a boot-gate
    // that also (wrongly) matches when boot never ran at all — which
    // would leave `animation-name` stuck at `none` and this `null`.
    expect(sample, "toastIn must have actually run for a returning visitor").not.toBeNull();
  });
});

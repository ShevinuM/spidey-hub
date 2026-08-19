// Shared e2e fixtures: every existing spec file navigates through its own
// local `gotoReady()`/`goto()` helper, and a
// few tests (tests/e2e/nav.spec.ts's live-clock test, tests/e2e/tmux.spec.ts
// lines 149/661/678/699/710) drive a raw `page.goto()` directly. The new
// BootSequence overlay (src/components/BootSequence.svelte) plays a full
// ~4.6s unskippable sequence on a fresh tab, which would otherwise make
// every one of those ~450 existing tests (which assert on the READY
// dashboard/view state, not on boot itself) eat 4.6s of real wall-clock
// time and have their very first keypress swallowed (boot is
// unskippable — global key handling is inert while it's active).
//
// Rather than touching every spec's own goto helper (easy to miss one —
// see the raw-`page.goto()` call sites above), this overrides Playwright's
// `context` fixture so EVERY page opened in EVERY test of an importing spec
// file gets the boot-seen sessionStorage flag pre-set via `addInitScript`
// before any navigation happens, regardless of which goto call site is
// used. This is the single choke point for the boot-skip sessionStorage flag
// via addInitScript to the SHARED e2e helpers/fixtures — no per-spec goto
// changes needed, and no spec can silently bypass it.
//
// tests/e2e/boot.spec.ts deliberately imports the raw `@playwright/test`
// instead of this module — it exists to exercise the real (non-skipped)
// boot sequence.
//
// Also pre-seeds two src/lib/notificationStore.ts sessionStorage overrides
// so every test importing this module gets deterministic notification
// behavior without sleeping through real severity timers:
//   - NOTIFICATIONS_INJECT_SEED_STORAGE_KEY pins WHICH 2 unseen pool entries
//     get injected per visit (Notifications.svelte reads it via
//     resolveInjectRand() at mount, same "set before any navigation"
//     contract as the boot-seen flag). `E2E_NOTIFICATIONS_INJECT_SEED` is
//     exported so a spec can compute the exact expected picks itself via
//     `pickRandomUnseen(pool, seenIds, 2, mulberry32(seed))` instead of
//     hardcoding notification copy.
//   - TOAST_DURATION_SCALE_STORAGE_KEY shrinks every toast's dismiss timer
//     (alert 10s/warn 5s/info 3s) by this factor, so a spec can observe an
//     auto-dismissal in well under a second instead of waiting out the real
//     duration. `E2E_TOAST_DURATION_SCALE` is exported for the same reason.
import { test as base, expect, type Page, type BrowserContext } from "@playwright/test";
import { BOOT_SEEN_STORAGE_KEY } from "../../src/lib/bootState.ts";
import { NOTIFICATIONS_INJECT_SEED_STORAGE_KEY, TOAST_DURATION_SCALE_STORAGE_KEY } from "../../src/lib/notificationStore.ts";

export const E2E_NOTIFICATIONS_INJECT_SEED = 424242;
// 0.3 keeps even the shortest (info, 3s) severity's scaled duration (900ms)
// comfortably longer than the toast's own FIXED (never scaled) .34s
// entrance animation — too aggressive a scale (e.g. 0.02) lets a toast's
// dismiss timer fire WHILE it's still mid-entrance-transform, which starves
// Playwright's hover() actionability check (it requires a stable bounding
// box) and flakes with "element was detached from the DOM, retrying".
export const E2E_TOAST_DURATION_SCALE = 0.3;

export const test = base.extend<{ context: BrowserContext }>({
  context: async ({ context }, use) => {
    await context.addInitScript(
      ({ bootKey, injectSeedKey, injectSeed, durationScaleKey, durationScale }) => {
        try {
          sessionStorage.setItem(bootKey, "1");
          sessionStorage.setItem(injectSeedKey, String(injectSeed));
          sessionStorage.setItem(durationScaleKey, String(durationScale));
        } catch {
          // ignore — same best-effort contract as src/lib/bootState.ts
        }
      },
      {
        bootKey: BOOT_SEEN_STORAGE_KEY,
        injectSeedKey: NOTIFICATIONS_INJECT_SEED_STORAGE_KEY,
        injectSeed: E2E_NOTIFICATIONS_INJECT_SEED,
        durationScaleKey: TOAST_DURATION_SCALE_STORAGE_KEY,
        durationScale: E2E_TOAST_DURATION_SCALE,
      },
    );
    await use(context);
  },
});

export { expect, type Page, type BrowserContext };

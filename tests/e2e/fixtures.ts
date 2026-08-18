// Shared e2e fixtures (PLAN.md Phase 5B item 5B.5): every existing spec
// file navigates through its own local `gotoReady()`/`goto()` helper, and a
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
// used. This is the single choke point PLAN.md's "add the boot-skip
// sessionStorage flag via addInitScript to the SHARED e2e helpers/fixtures"
// refers to — no per-spec goto changes needed, and no spec can silently
// bypass it.
//
// tests/e2e/boot.spec.ts deliberately imports the raw `@playwright/test`
// instead of this module — it exists to exercise the real (non-skipped)
// boot sequence.
//
// PLAN.md Iteration 3 Phase 2 item 2.4: also pre-seeds
// TOAST_SEED_STORAGE_KEY (src/lib/notifications.ts) so the dashboard's
// seeded 2-of-pool toast pick (Locked decision #12) is pinned to a known
// value for every test importing this module — Toasts.svelte reads the key
// at pick time (onMount), same "set before any navigation" contract as the
// boot-seen flag above. `E2E_TOAST_SEED` is exported so specs can compute
// the expected pinned pair themselves via `pickToastPair(pool, E2E_TOAST_SEED)`
// instead of hardcoding toast copy (content-purity: no notification string
// lives in a test file either).
import { test as base, expect, type Page, type BrowserContext } from "@playwright/test";
import { BOOT_SEEN_STORAGE_KEY } from "../../src/lib/bootState.ts";
import { TOAST_SEED_STORAGE_KEY } from "../../src/lib/notifications.ts";

export const E2E_TOAST_SEED = 424242;

export const test = base.extend<{ context: BrowserContext }>({
  context: async ({ context }, use) => {
    await context.addInitScript(
      ({ bootKey, toastSeedKey, toastSeed }) => {
        try {
          sessionStorage.setItem(bootKey, "1");
          sessionStorage.setItem(toastSeedKey, String(toastSeed));
        } catch {
          // ignore — same best-effort contract as src/lib/bootState.ts
        }
      },
      { bootKey: BOOT_SEEN_STORAGE_KEY, toastSeedKey: TOAST_SEED_STORAGE_KEY, toastSeed: E2E_TOAST_SEED },
    );
    await use(context);
  },
});

export { expect, type Page, type BrowserContext };

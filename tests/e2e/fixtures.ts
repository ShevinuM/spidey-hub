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
import { test as base, expect, type Page, type BrowserContext } from "@playwright/test";
import { BOOT_SEEN_STORAGE_KEY } from "../../src/lib/bootState.ts";

export const test = base.extend<{ context: BrowserContext }>({
  context: async ({ context }, use) => {
    await context.addInitScript((key) => {
      try {
        sessionStorage.setItem(key, "1");
      } catch {
        // ignore — same best-effort contract as src/lib/bootState.ts
      }
    }, BOOT_SEEN_STORAGE_KEY);
    await use(context);
  },
});

export { expect, type Page, type BrowserContext };

import { expect, type Page } from "@playwright/test";
import { StatusBarPage } from "../../../../../../common/tests/ui/pages/StatusBarPage";
import { BOOT_HARD_STOP_MS, CLOCK_TIME } from "../../../../../../common/tests/ui/support/recipes";

/**
 * Page object for the boot feature's harness mount (`BootSequence.svelte`,
 * mounted directly by `src/pages/harness/[feature].astro` — no wrapper, see
 * that route's own comment). Named for the feature it models, not the suite
 * that happens to use it (matching `ProfilePage`/`HelpPage` convention) —
 * currently consumed only by the harness suite (`tests/ui/harness/`).
 *
 * Kernel-chrome locators (the status bar, etc.) are never redefined here —
 * `e2e-testing.md` R005 — this composes the shared `StatusBarPage` instead.
 *
 * Owns the fake-clock protocol boot's own capture pipeline
 * (`common/tests/ui/support/pipeline.mjs`'s `captureBootState()`) already
 * proved deterministic: `clock.install()` then `clock.pauseAt(t0)` BEFORE
 * `page.goto()` pins `Date.now()` through navigation and hydration exactly,
 * rather than the ordinary "install then advance after load" sequence
 * (which is fine for every other recipe but not for boot's own
 * elapsed-time-driven math — see that function's header comment for the
 * two determinism hazards this avoids). `pauseAt()` only fires timers that
 * already existed at the moment it's called, so reaching a state PAST
 * `BOOT_HARD_STOP_MS` needs the same two-stage jump `captureBootState()`
 * uses — `advanceTo()` below encapsulates that rule so the spec itself
 * never has to reason about it.
 */
export class BootPage {
  readonly statusBar: StatusBarPage;
  private readonly t0: number;

  constructor(private readonly page: Page) {
    this.statusBar = new StatusBarPage(page);
    this.t0 = new Date(CLOCK_TIME).getTime();
  }

  // --- getters ---

  get bootSequence() {
    return this.page.getByTestId("boot-sequence");
  }

  get bootOutro() {
    return this.page.getByTestId("boot-outro");
  }

  get pct() {
    return this.page.getByTestId("boot-pct");
  }

  get phase() {
    return this.page.getByTestId("boot-phase");
  }

  // --- behavior methods ---

  /** Installs the fake clock pinned to `CLOCK_TIME` BEFORE navigating (same
   * ordering as `captureBootState()`), then awaits `data-boot-running`
   * becoming `"true"` — flipped synchronously inside BootSequence.svelte's
   * own `run()`, the same marker `captureBootState()` waits on, and the
   * harness-hydration-race equivalent of `ProfilePage`'s/`HelpPage`'s own
   * `data-*-ready` waits (BootSequence already ships a purpose-built one;
   * no separate wrapper element is needed). Named for the outcome it
   * awaits (`e2e-testing.md` R007) rather than a bare `openHarness`, since
   * the wait is a real assertion (`toHaveAttribute`, not `.waitFor()` —
   * there is no CSS-free way to combine the testid with a specific
   * attribute VALUE the way the ported `boot.spec.ts`'s own `freshBoot()`
   * does via a raw `[data-testid=…][data-boot-running=…]` selector, which
   * `playwright.md` R002 forbids for authored code). No boot-seen
   * sessionStorage pre-seed — this page object is only ever used with the
   * raw `@playwright/test` import (never the shared `context` fixture), so
   * a genuine, unskipped boot always plays. */
  async openHarnessAndAwaitBootRunning() {
    await this.page.clock.install({ time: CLOCK_TIME });
    await this.page.clock.pauseAt(this.t0);
    await this.page.goto("/harness/boot");
    await expect(this.bootSequence).toHaveAttribute("data-boot-running", "true");
  }

  /** Jumps the fake clock to `t0 + offsetMs` elapsed. Stages through
   * `BOOT_HARD_STOP_MS + 10` first when `offsetMs` crosses it, so
   * `finish()`'s outro `setTimeout` is actually scheduled (not just due)
   * before the final jump — `pauseAt()` never fires a timer a callback
   * schedules during the same jump it's called from. */
  async advanceTo(offsetMs: number) {
    if (offsetMs > BOOT_HARD_STOP_MS) {
      await this.page.clock.pauseAt(this.t0 + BOOT_HARD_STOP_MS + 10);
    }
    await this.page.clock.pauseAt(this.t0 + offsetMs);
  }
}

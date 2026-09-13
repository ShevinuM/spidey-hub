import { expect, type Page } from "@playwright/test";
import { StatusBarPage } from "../../../../../common/tests/ui/pages/StatusBarPage";
import { BOOT_HARD_STOP_MS, CLOCK_TIME } from "../../../../../common/tests/ui/support/recipes";

/**
 * Page object for the boot feature's harness mount (`BootSequence.svelte`,
 * mounted directly by `src/pages/harness/[feature].astro`). Named for the
 * feature it models, not the suite that uses it (matching `ProfilePage`/
 * `HelpPage` convention).
 *
 * Kernel-chrome locators (the status bar, etc.) are never redefined here —
 * `e2e-testing.md` R005 — this composes the shared `StatusBarPage` instead.
 *
 * Installs the fake clock via `clock.install()` then `clock.pauseAt(t0)`
 * BEFORE `page.goto()`, pinning `Date.now()` through navigation and
 * hydration exactly; `advanceTo()` below encapsulates the two-stage jump
 * needed to cross `BOOT_HARD_STOP_MS`.
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

  /** Installs the fake clock pinned to `CLOCK_TIME` before navigating, then
   * awaits `data-boot-running="true"` — flipped synchronously inside
   * BootSequence.svelte's own `run()`. Named for the outcome it awaits
   * (`e2e-testing.md` R007) rather than a bare `openHarness`, since the
   * wait is a real assertion (`toHaveAttribute`, not `.waitFor()`), which
   * `playwright.md` R002 requires over a raw CSS attribute selector. No
   * boot-seen sessionStorage pre-seed: this page object is only ever used
   * with the raw `@playwright/test` import, so a genuine, unskipped boot
   * always plays. */
  async openHarnessAndAwaitBootRunning() {
    await this.page.clock.install({ time: CLOCK_TIME });
    await this.page.clock.pauseAt(this.t0);
    await this.page.goto("/harness/boot");
    await expect(this.bootSequence).toHaveAttribute("data-boot-running", "true");
  }

  /** Jumps the fake clock to `t0 + offsetMs`, staging through
   * `BOOT_HARD_STOP_MS + 10` first when the target crosses it —
   * `pauseAt()` never fires a timer scheduled during the same jump it's
   * called from, so `finish()`'s outro timeout must already exist before
   * the final jump. */
  async advanceTo(offsetMs: number) {
    if (offsetMs > BOOT_HARD_STOP_MS) {
      await this.page.clock.pauseAt(this.t0 + BOOT_HARD_STOP_MS + 10);
    }
    await this.page.clock.pauseAt(this.t0 + offsetMs);
  }
}

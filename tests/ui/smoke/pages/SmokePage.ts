import { expect, type Page } from "@playwright/test";

/**
 * Page object for the root smoke tier (`e2e-testing.md` R003/R004:
 * specs call page-object methods/getters, never `page.locator(...)`
 * directly; `playwright.md` R002: no raw CSS selector anywhere, ever —
 * unconditional, so even the readiness locator itself must resolve via
 * `getByTestId`, not the `data-terminal-ready` attribute selector).
 *
 * `data-testid="terminal-ready"` is a STATIC id on the same root element
 * `data-terminal-ready` already lives on (`Terminal.svelte`) — it locates
 * the element regardless of boot state; the actual readiness signal is the
 * separate `data-terminal-ready` attribute's value, asserted below via
 * `toHaveAttribute` (Playwright's own auto-waiting, not a manual `waitFor`).
 */
export class SmokePage {
  constructor(private readonly page: Page) {}

  /** Exposed as a getter (R004), not a field — resolves lazily on each
   * access rather than being captured before the terminal even mounts. */
  get terminal() {
    return this.page.getByTestId("terminal-ready");
  }

  /** Waits for the real (unskipped) boot sequence to finish and hand off —
   * named for the outcome, not the mechanism (R006-style atomic action). */
  async waitUntilBooted(timeout = 15_000) {
    await expect(this.terminal).toHaveAttribute("data-terminal-ready", "true", { timeout });
  }
}

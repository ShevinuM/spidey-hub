import { expect, type Page } from "@playwright/test";

/**
 * Page object for the booted terminal shell, named for the UI surface it models rather than the suite that uses it.
 *
 * `data-testid="terminal-ready"` is a static id on Terminal.svelte's root — it locates the element regardless of boot state, while the separate `data-terminal-ready` attribute's value, asserted below via `toHaveAttribute`, is the actual readiness signal.
 */
export class TerminalPage {
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

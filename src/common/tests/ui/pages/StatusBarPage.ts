import type { Page } from "@playwright/test";

/**
 * Shared page object for kernel-chrome status-bar locators
 * (`StatusBar.svelte`) — lives in `src/common/tests/ui/pages/` per
 * `e2e-testing.md` R005: a feature's own page object may never redefine a
 * kernel-chrome locator, since every feature's harness spec needs the exact
 * same "no kernel chrome mounted alongside this feature in isolation" proof.
 * Composed into a feature page object (e.g. `ProfilePage`/`HelpPage`) rather
 * than duplicated — kept to what its consumers actually use, which today is
 * just the window-list locator itself, asserted via `.toHaveCount(0)`.
 */
export class StatusBarPage {
  constructor(private readonly page: Page) {}

  get windows() {
    return this.page.getByTestId("status-bar-windows");
  }
}

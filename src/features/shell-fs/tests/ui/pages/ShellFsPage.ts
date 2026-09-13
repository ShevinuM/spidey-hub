import { expect, type Page } from "@playwright/test";

export class ShellFsPage {
  constructor(private readonly page: Page) {}

  /** Navigates to the standalone harness route and waits for the wrapper's
   * own hydration flag, guarding the same `client:load` race
   * `GrepPage.openHarness()`/`RepositoriesPage.openHarness()` guard
   * against. */
  async openHarness() {
    await this.page.goto("/harness/shell-fs");
    await expect(this.page.getByTestId("shell-fs-harness-ready")).toHaveAttribute("data-ready", "true");
  }

  get scroller() {
    return this.page.getByTestId("shell-scroller");
  }

  get lines() {
    return this.page.getByTestId("shell-line");
  }

  get prompt() {
    return this.page.getByTestId("shell-prompt");
  }

  get input() {
    return this.page.getByTestId("shell-input");
  }
}

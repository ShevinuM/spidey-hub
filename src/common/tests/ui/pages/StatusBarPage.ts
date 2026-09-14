import type { Page } from "@playwright/test";

/** Shared page object for kernel-chrome status-bar locators, composed into each feature's page object per e2e-testing.md R005 rather than redefined per feature. */
export class StatusBarPage {
  constructor(private readonly page: Page) {}

  get windows() {
    return this.page.getByTestId("status-bar-windows");
  }
}

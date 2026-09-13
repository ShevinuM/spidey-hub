import { expect, type Page } from "@playwright/test";
import { StatusBarPage } from "../../../../../common/tests/ui/pages/StatusBarPage";

/** Page object for Dashboard.svelte's harness mount; composes the shared `StatusBarPage` for kernel-chrome locators rather than redefining them (`e2e-testing.md` R005). */
export class DashboardPage {
  readonly statusBar: StatusBarPage;

  constructor(private readonly page: Page) {
    this.statusBar = new StatusBarPage(page);
  }

  /** Navigates to the harness route and waits for DashboardHarness.svelte's hydration flag, not a content locator (see that flag's own comment for why). */
  async openHarness() {
    await this.page.goto("/harness/dashboard");
    await expect(this.page.getByTestId("dashboard-harness-ready")).toHaveAttribute("data-ready", "true");
  }

  get wordmark() {
    return this.page.getByTestId("dashboard-wordmark");
  }

  /** All 5 menu rows, in `dashboard.yaml`'s own order; `playwright.md` R002/R004 rule out a raw attribute selector, so callers narrow with `.nth(i)` (a Playwright locator method, not a CSS selector). */
  get menuRows() {
    return this.page.getByTestId("dashboard-menu-row");
  }

  /** The footer's "synced N/N panes" line has no `data-testid` (it isn't repeated, so `playwright.md` R002's testid escape hatch never triggers), so this uses `getByText` instead. */
  get footerSyncLine() {
    return this.page.getByText(/⚡ synced \d+\/\d+ panes/);
  }
}

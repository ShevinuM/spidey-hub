import { expect, type Page } from "@playwright/test";
import { StatusBarPage } from "../../../../../../common/tests/ui/pages/StatusBarPage";

/**
 * Page object for the dashboard feature's harness mount (`Dashboard.svelte`,
 * wrapped by `DashboardHarness.svelte` solely to supply the onMount-flipped
 * ready marker and its synthetic props — see that wrapper's own header
 * comment for why). Named for the feature it models, not the suite that
 * happens to use it (matching `ProfilePage`/`HelpPage`/`NotificationsPage`
 * convention) — currently consumed only by the harness suite
 * (`tests/ui/harness/`), since the e2e suite's `dashboard.spec.ts` is a
 * verbatim-ported spec exempt from the page-object convention.
 *
 * Kernel-chrome locators (the status bar, etc.) are never redefined here —
 * `e2e-testing.md` R005 — this composes the shared `StatusBarPage` instead.
 */
export class DashboardPage {
  readonly statusBar: StatusBarPage;

  constructor(private readonly page: Page) {
    this.statusBar = new StatusBarPage(page);
  }

  /** Navigates straight to the standalone harness route and waits for the
   * wrapper's own hydration flag — same race `HelpPage.openHarness()`/
   * `NotificationsPage.openHarness()` guard against: the server-rendered
   * HTML (wordmark, menu rows, footer line) is present before any JS runs,
   * so reading those values right after `goto()` would prove nothing about
   * hydration. Waits on the `data-ready` flag (flipped by an `onMount`)
   * rather than any content locator, which would resolve immediately from
   * the static markup alone. */
  async openHarness() {
    await this.page.goto("/harness/dashboard");
    await expect(this.page.getByTestId("dashboard-harness-ready")).toHaveAttribute("data-ready", "true");
  }

  get wordmark() {
    return this.page.getByTestId("dashboard-wordmark");
  }

  /** All 5 menu rows, in `dashboard.yaml`'s own order — `playwright.md`
   * R002/R004 rule out a raw `[data-menu-id="..."]` attribute selector to
   * pick one out, so callers narrow with `.nth(i)` (a Playwright locator
   * method, not a CSS selector) against the same yaml-order index the
   * ported e2e `dashboard.spec.ts`'s own `MENU` table already relies on. */
  get menuRows() {
    return this.page.getByTestId("dashboard-menu-row");
  }

  /** The footer's "synced N/N panes" line — no `data-testid` exists on this
   * element (it isn't repeated, so `playwright.md` R002's own escape hatch
   * — add a testid only when narrowing a REPEATED element needs one — never
   * triggers), so this uses `getByText` (strategy #2, not a CSS selector)
   * the same way the ported e2e `dashboard.spec.ts` locates it. */
  get footerSyncLine() {
    return this.page.getByText(/⚡ synced \d+\/\d+ panes/);
  }
}

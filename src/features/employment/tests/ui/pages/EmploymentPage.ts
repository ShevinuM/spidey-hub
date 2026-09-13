import { expect, type Page } from "@playwright/test";
import { StatusBarPage } from "../../../../../common/tests/ui/pages/StatusBarPage";

/**
 * Page object for the employment feature's harness mount, named for the feature it models rather than the suite that uses it (matching `NotificationsPage`/`DashboardPage`), and currently consumed only by the harness suite.
 *
 * Kernel-chrome locators (the status bar, etc.) are never redefined here — this composes the shared `StatusBarPage` instead.
 */
export class EmploymentPage {
  readonly statusBar: StatusBarPage;

  constructor(private readonly page: Page) {
    this.statusBar = new StatusBarPage(page);
  }

  /** Navigates to the standalone harness route and waits for the wrapper's `data-ready` hydration flag rather than a content locator, since the content markup is present in the static HTML before `client:load`'s listener attaches. */
  async openHarness() {
    await this.page.goto("/harness/employment");
    await expect(this.page.getByTestId("employment-harness-ready")).toHaveAttribute("data-ready", "true");
  }

  get rows() {
    return this.page.getByTestId("employment-row");
  }

  get timelineNodes() {
    return this.page.getByTestId("employment-timeline-node");
  }

  get previewPath() {
    return this.page.getByTestId("employment-preview-path");
  }

  get editorScroller() {
    return this.page.getByTestId("editor-scroller");
  }

  /** Presses a key, routed by `EmploymentHarness.svelte`'s own keydown
   * wrapper (not Terminal's/PaneTree's) into `EmploymentRecords.svelte`'s
   * exported `handleKey()` — proving the harness's own routing, not a
   * kernel-only hotkey. */
  async pressKey(key: string) {
    await this.page.keyboard.press(key);
  }
}

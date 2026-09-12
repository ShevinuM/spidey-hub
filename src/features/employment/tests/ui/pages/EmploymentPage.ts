import { expect, type Page } from "@playwright/test";
import { StatusBarPage } from "../../../../../../common/tests/ui/pages/StatusBarPage";

/**
 * Page object for the employment feature's harness mount
 * (`EmploymentRecords.svelte`, wrapped by `EmploymentHarness.svelte` to
 * reproduce the generic per-pane-ref keydown delegation Terminal.svelte/
 * PaneTree.svelte normally own — see that wrapper's own header comment for
 * why). Named for the feature it models, not the suite that happens to use
 * it (matching `NotificationsPage`/`DashboardPage` convention) — currently
 * consumed only by the harness suite (`tests/ui/harness/`), since the e2e
 * suite's `employment*.spec.ts` files are verbatim-ported specs exempt from
 * the page-object convention.
 *
 * Kernel-chrome locators (the status bar, etc.) are never redefined here —
 * `e2e-testing.md` R005 — this composes the shared `StatusBarPage` instead.
 */
export class EmploymentPage {
  readonly statusBar: StatusBarPage;

  constructor(private readonly page: Page) {
    this.statusBar = new StatusBarPage(page);
  }

  /** Navigates straight to the standalone harness route and waits for the
   * wrapper's own hydration flag — same race `NotificationsPage.openHarness()`/
   * `DashboardPage.openHarness()` guard against: the server-rendered HTML
   * (rows, timeline, preview) is present before `client:load`'s JS runs, so
   * a keypress sent right after `goto()` could race
   * `EmploymentHarness.svelte`'s `<svelte:window>` listener attaching.
   * Waits on its `data-ready` flag (flipped by an `onMount`) rather than any
   * content locator, which would resolve immediately from the static
   * markup alone. */
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

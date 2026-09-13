import { expect, type Page } from "@playwright/test";
import { StatusBarPage } from "../../../../../common/tests/ui/pages/StatusBarPage";

/**
 * Page object for the grep feature's harness mount (`GrepOverlay.svelte`,
 * wrapped by `GrepHarness.svelte` to reproduce the generic keydown
 * delegation Terminal.svelte normally owns — see that wrapper's own header
 * comment for why). Named for the UI surface it models, matching
 * `StatusBarPage`/`RepositoriesPage` convention. Currently consumed only by
 * the harness suite (`tests/ui/harness/`), since the e2e suite's
 * `grep.spec.ts` is a verbatim-ported spec exempt from the page-object
 * convention.
 *
 * Kernel-chrome locators (the status bar, etc.) are never redefined here —
 * this composes the shared `StatusBarPage` instead.
 */
export class GrepPage {
  readonly statusBar: StatusBarPage;

  constructor(private readonly page: Page) {
    this.statusBar = new StatusBarPage(page);
  }

  /** Navigates straight to the standalone harness route and waits for the
   * wrapper's own hydration flag — same race `RepositoriesPage.openHarness()`/
   * `NotificationsPage.openHarness()` guard against: the server-rendered
   * HTML is present before `client:load`'s JS runs, so a keypress sent
   * right after `goto()` could race `GrepHarness.svelte`'s
   * `<svelte:window>` listener attaching. Waits on its `data-ready` flag
   * (flipped by an `onMount`) rather than any content locator — the
   * overlay itself renders nothing until `/` is pressed (see
   * `GrepOverlay.svelte`'s own header comment), so there is no content
   * locator to wait on anyway. */
  async openHarness() {
    await this.page.goto("/harness/grep");
    await expect(this.page.getByTestId("grep-harness-ready")).toHaveAttribute("data-ready", "true");
  }

  get overlay() {
    return this.page.getByTestId("grep-overlay");
  }

  get query() {
    return this.page.getByTestId("grep-query");
  }

  get counter() {
    return this.page.getByTestId("grep-counter");
  }

  get mode() {
    return this.page.getByTestId("grep-mode");
  }

  get rows() {
    return this.page.getByTestId("grep-row");
  }

  get file() {
    return this.page.getByTestId("grep-file");
  }

  get filePos() {
    return this.page.getByTestId("grep-file-pos");
  }

  get preview() {
    return this.page.getByTestId("grep-preview");
  }

  /** Resolves a result row by its visible path text — `r.path` is rendered
   * verbatim in the row's own path span (QueryListPanel.svelte), so this
   * never needs a raw CSS attribute selector (`playwright.md` R002). */
  rowByPath(path: string) {
    return this.rows.filter({ hasText: path });
  }
}

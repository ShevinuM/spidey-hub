import { expect, type Page } from "@playwright/test";
import { StatusBarPage } from "../../../../../common/tests/ui/pages/StatusBarPage";

/** Page object for the grep feature's harness mount; the e2e suite's
 * `grep.spec.ts` is a verbatim port and stays exempt from this
 * convention. */
export class GrepPage {
  readonly statusBar: StatusBarPage;

  constructor(private readonly page: Page) {
    this.statusBar = new StatusBarPage(page);
  }

  /** Navigates to the standalone harness route and waits for the wrapper's
   * own hydration flag, guarding the same `client:load` race
   * `RepositoriesPage.openHarness()`/`NotificationsPage.openHarness()`
   * guard against. */
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

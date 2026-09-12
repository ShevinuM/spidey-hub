import { expect, type Page } from "@playwright/test";
import { StatusBarPage } from "../../../../../../common/tests/ui/pages/StatusBarPage";

/**
 * Page object for the repositories feature's harness mount
 * (`Repositories.svelte`, wrapped by `RepositoriesHarness.svelte` to
 * reproduce the generic per-pane-ref keydown delegation Terminal.svelte/
 * PaneTree.svelte normally own — see that wrapper's own header comment for
 * why). Named for the UI surface it models, matching
 * `StatusBarPage`/`EmploymentPage`/`DashboardPage` convention — the naming
 * `common/tests/ui/pages/TerminalPage.ts`'s own header comment names as an
 * example, closing that file's forward reference. Currently consumed only
 * by the harness suite (`tests/ui/harness/`), since the e2e suite's
 * `repositories*.spec.ts` files are verbatim-ported specs exempt from the
 * page-object convention.
 *
 * Kernel-chrome locators (the status bar, etc.) are never redefined here —
 * this composes the shared `StatusBarPage` instead.
 */
export class RepositoriesPage {
  readonly statusBar: StatusBarPage;

  constructor(private readonly page: Page) {
    this.statusBar = new StatusBarPage(page);
  }

  /** Navigates straight to the standalone harness route and waits for the
   * wrapper's own hydration flag — same race `EmploymentPage.openHarness()`/
   * `NotificationsPage.openHarness()` guard against: the server-rendered
   * HTML (repo list, files tree, preview, commits, status panel) is
   * present before `client:load`'s JS runs, so a keypress/click sent right
   * after `goto()` could race `RepositoriesHarness.svelte`'s
   * `<svelte:window>` listener / the panels' own client-side fetches. Waits
   * on its `data-ready` flag (flipped by an `onMount`) rather than any
   * content locator, which would resolve immediately from the static
   * markup alone. */
  async openHarness() {
    await this.page.goto("/harness/repositories");
    await expect(this.page.getByTestId("repositories-harness-ready")).toHaveAttribute("data-ready", "true");
  }

  get repoRows() {
    return this.page.getByTestId("repositories-repo-row");
  }

  get treeRows() {
    return this.page.getByTestId("repositories-tree-row");
  }

  get filesCaption() {
    return this.page.getByTestId("repositories-files-caption");
  }

  get previewLines() {
    return this.page.getByTestId("repositories-preview-line");
  }

  get previewText() {
    return this.page.getByTestId("repositories-preview-text");
  }

  get commitRows() {
    return this.page.getByTestId("repositories-commit-row");
  }

  get commitsCaption() {
    return this.page.getByTestId("repositories-commits-caption");
  }

  get contribCells() {
    return this.page.getByTestId("repositories-contrib-cell");
  }

  /** Resolves a panel [1] repo row by its visible name text — `repo.key` is
   * rendered verbatim in the row's own label span (ReposPanel.svelte), so
   * this never needs a raw CSS attribute selector (`playwright.md` R002).
   * Every fixture repo name is unique, so a substring `hasText` match never
   * collides with a different row. */
  repoRow(name: string) {
    return this.repoRows.filter({ hasText: name });
  }

  /** Resolves a panel [2] tree row by its visible entry name text —
   * `entry.name` is rendered verbatim at the end of the row
   * (FilesPanel.svelte), same reasoning as `repoRow()` above. */
  treeRow(name: string) {
    return this.treeRows.filter({ hasText: name });
  }
}

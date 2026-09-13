import { expect, type Page } from "@playwright/test";
import { StatusBarPage } from "../../../../../common/tests/ui/pages/StatusBarPage";

/** Page object for the repositories harness mount; composes the shared `StatusBarPage` for kernel chrome rather than redefining it. */
export class RepositoriesPage {
  readonly statusBar: StatusBarPage;

  constructor(private readonly page: Page) {
    this.statusBar = new StatusBarPage(page);
  }

  /** Navigates to the harness route and waits for the hydration-ready flag, not a content locator, since the server-rendered markup would otherwise resolve before client-side listeners attach. */
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

  /** Resolves a row by its visible repo-name text (avoiding a CSS attribute selector, playwright.md R002); every fixture name is unique so a substring match can't collide. */
  repoRow(name: string) {
    return this.repoRows.filter({ hasText: name });
  }

  /** Resolves a tree row by its visible entry-name text, same reasoning as `repoRow()`. */
  treeRow(name: string) {
    return this.treeRows.filter({ hasText: name });
  }
}

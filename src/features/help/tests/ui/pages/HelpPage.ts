import { expect, type Page } from "@playwright/test";
import { StatusBarPage } from "../../../../../common/tests/ui/pages/StatusBarPage";

/** Page object for the help feature's harness mount (`HelpView.svelte` +
 * `HelpSearch.svelte`, composed by `HelpHarness.svelte`); composes the
 * shared `StatusBarPage` rather than redefining kernel-chrome locators. */
export class HelpPage {
  readonly statusBar: StatusBarPage;

  constructor(private readonly page: Page) {
    this.statusBar = new StatusBarPage(page);
  }

  /** Waits for the `data-ready` flag (flipped by `onMount`, so only after
   * hydration) rather than a content locator, since the server-rendered
   * HTML is present before `HelpHarness.svelte`'s own listener attaches. */
  async openHarness() {
    await this.page.goto("/harness/help");
    await expect(this.page.getByTestId("help-harness-ready")).toHaveAttribute("data-ready", "true");
  }

  get title() {
    return this.page.getByTestId("help-title");
  }

  get rows() {
    return this.page.getByTestId("help-row");
  }

  get scopeTabs() {
    return this.page.getByTestId("help-scope-tab");
  }

  get searchOverlay() {
    return this.page.getByTestId("help-search-overlay");
  }

  get searchInput() {
    return this.page.getByTestId("help-search-input");
  }

  get searchResults() {
    return this.page.getByTestId("help-search-result");
  }

  get lastExecuted() {
    return this.page.getByTestId("help-harness-last-executed");
  }

  /** Opens the `?` palette via a real keydown — HelpHarness.svelte's own
   * minimal routing (not Terminal's), so this proves the harness's own
   * wiring, not the kernel's. */
  async openSearch() {
    await this.page.keyboard.press("?");
  }
}

import { expect, type Page } from "@playwright/test";

/**
 * Page object for the help feature's harness mount (`HelpView.svelte` +
 * `HelpSearch.svelte`, composed by `HelpHarness.svelte` — see
 * `e2e-testing.md` R003/R004: specs call page-object getters/methods, never
 * `page.locator(...)`/raw testid strings directly). Named for the feature it
 * models, not the suite that happens to use it (matching `ProfilePage`
 * convention) — currently consumed only by the harness suite
 * (`tests/ui/harness/`), since the e2e suite's `help*.spec.ts` files are
 * verbatim-ported specs exempt from the page-object convention.
 */
export class HelpPage {
  constructor(private readonly page: Page) {}

  /** Navigates straight to the standalone harness route — no kernel, no
   * boot sequence, but this feature's harness DOES need a real hydration
   * wait (unlike profile's): `client:load` ships its JS asynchronously, and
   * the server-rendered HTML (content included) is present before any JS
   * runs, so a keypress sent right after `goto()` could race
   * `HelpHarness.svelte`'s `<svelte:window>` listener attaching. Waits for
   * its `data-ready` flag (flipped by an `$effect`, which only ever runs
   * post-mount) rather than any content locator, which would resolve
   * immediately from the static markup alone. */
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

  get statusBarWindows() {
    return this.page.getByTestId("status-bar-windows");
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

  /** `HelpHarness.svelte`'s own stand-in for `executeSiteAction` — the last
   * command action resolved by Enter, rendered as plain text since there is
   * no real site navigation to assert against in isolation. */
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

import { expect, type Page } from "@playwright/test";

/**
 * Page object for the shell-fs feature's harness mount (`Shell.svelte`,
 * wrapped by `ShellFsHarness.svelte` to reproduce the generic keydown
 * delegation Terminal.svelte/PaneTree.svelte normally own — see that
 * wrapper's own header comment for why). Named for the UI surface it
 * models, matching `GrepPage`/`RepositoriesPage` convention. Currently
 * consumed only by the harness suite (`tests/ui/harness/`), since the e2e
 * suite's `shell.spec.ts` is a verbatim-ported spec exempt from the
 * page-object convention.
 */
export class ShellFsPage {
  constructor(private readonly page: Page) {}

  /** Navigates straight to the standalone harness route and waits for the
   * wrapper's own hydration flag — same race `GrepPage.openHarness()`/
   * `RepositoriesPage.openHarness()` guard against: the server-rendered
   * HTML (the prompt, the empty scroller) is present before `client:load`'s
   * JS runs, so a keypress sent right after `goto()` could race
   * `ShellFsHarness.svelte`'s `<svelte:window>` listener attaching. Waits
   * on its `data-ready` flag (flipped by an `onMount`) rather than any
   * content locator. */
  async openHarness() {
    await this.page.goto("/harness/shell-fs");
    await expect(this.page.getByTestId("shell-fs-harness-ready")).toHaveAttribute("data-ready", "true");
  }

  get scroller() {
    return this.page.getByTestId("shell-scroller");
  }

  get lines() {
    return this.page.getByTestId("shell-line");
  }

  get prompt() {
    return this.page.getByTestId("shell-prompt");
  }

  get input() {
    return this.page.getByTestId("shell-input");
  }
}

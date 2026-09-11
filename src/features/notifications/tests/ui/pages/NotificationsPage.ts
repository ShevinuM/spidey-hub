import { expect, type Page } from "@playwright/test";
import { StatusBarPage } from "../../../../../../common/tests/ui/pages/StatusBarPage";

/**
 * Page object for the notifications feature's harness mount
 * (`Notifications.svelte`, wrapped by `NotificationsHarness.svelte` to
 * reproduce Terminal.svelte's own `n`/Esc keydown delegation — see that
 * wrapper's header comment for why). Named for the feature it models, not
 * the suite that happens to use it (matching `HelpPage`/`ProfilePage`
 * convention) — currently consumed only by the harness suite
 * (`tests/ui/harness/`), since the e2e suite's `notifications*.spec.ts`
 * files are verbatim-ported specs exempt from the page-object convention.
 *
 * Kernel-chrome locators (the status bar, etc.) are never redefined here —
 * `e2e-testing.md` R005 — this composes the shared `StatusBarPage` instead.
 */
export class NotificationsPage {
  readonly statusBar: StatusBarPage;

  constructor(private readonly page: Page) {
    this.statusBar = new StatusBarPage(page);
  }

  /** Navigates straight to the standalone harness route and waits for the
   * wrapper's own hydration flag — same race `HelpPage.openHarness()`
   * guards against: the server-rendered HTML (bell/panel markup included)
   * is present before any JS runs, so a keypress sent right after
   * `goto()` could race `NotificationsHarness.svelte`'s `<svelte:window>`
   * listener attaching. Waits on its `data-ready` flag (flipped by an
   * `onMount`) rather than any content locator, which would resolve
   * immediately from the static markup alone. */
  async openHarness() {
    await this.page.goto("/harness/notifications");
    await expect(this.page.getByTestId("notifications-harness-ready")).toHaveAttribute("data-ready", "true");
  }

  get bell() {
    return this.page.getByTestId("notifications-bell");
  }

  get panel() {
    return this.page.getByTestId("notifications-panel");
  }

  get toasts() {
    return this.page.getByTestId("toast");
  }

  /** Presses `n`, routed by `NotificationsHarness.svelte`'s own keydown
   * wrapper (not Terminal's) into `Notifications.svelte`'s exported
   * `handleKey()` — proving the harness's own routing, not a kernel-only
   * hotkey. */
  async toggleViaKey() {
    await this.page.keyboard.press("n");
  }
}

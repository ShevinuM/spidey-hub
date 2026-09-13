import { expect, type Page } from "@playwright/test";
import { StatusBarPage } from "../../../../../common/tests/ui/pages/StatusBarPage";

export class NotificationsPage {
  readonly statusBar: StatusBarPage;

  constructor(private readonly page: Page) {
    this.statusBar = new StatusBarPage(page);
  }

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

  /** Presses `n`, routed by the harness's own keydown wrapper rather than Terminal's. */
  async toggleViaKey() {
    await this.page.keyboard.press("n");
  }
}

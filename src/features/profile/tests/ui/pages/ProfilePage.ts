import type { Page } from "@playwright/test";
import { StatusBarPage } from "../../../../../common/tests/ui/pages/StatusBarPage";

/**
 * Page object for Profile.svelte (`e2e-testing.md` R003/R004: specs call page-object getters/methods, never raw testid strings).
 *
 * Consumed only by the harness suite — `profile.spec.ts`'s e2e suite is a verbatim-ported spec exempt from the page-object convention.
 *
 * Kernel-chrome locators (the status bar, etc.) are never redefined here — `e2e-testing.md` R005 — this composes the shared `StatusBarPage` instead.
 */
export class ProfilePage {
  readonly statusBar: StatusBarPage;

  constructor(private readonly page: Page) {
    this.statusBar = new StatusBarPage(page);
  }

  /** Navigates straight to the standalone harness route — no kernel, no
   * boot sequence, so no readiness wait is needed beyond the dossier
   * locator's own auto-waiting. */
  async openHarness() {
    await this.page.goto("/harness/profile");
  }

  get dossier() {
    return this.page.getByTestId("profile-dossier");
  }

  get cvLink() {
    return this.page.getByTestId("profile-cv-link");
  }

  get contactLinks() {
    return this.page.getByTestId("profile-contact-link");
  }

  /** Each of the 60 SIGNAL bars carries its own `data-testid`
   * (`signal-meter-bar`, on `Meter.svelte`) — `getByTestId` matches all 60,
   * with no CSS/structural narrowing needed to reach them. */
  get meterBars() {
    return this.page.getByTestId("signal-meter-bar");
  }

  /** The first meter bar's live `style.height`, sampled once — callers
   * compare successive samples to prove the rAF loop is actually
   * running (an inline style write, not a class/attribute Playwright's
   * own locator assertions can match against). */
  firstBarHeight(): Promise<string> {
    return this.meterBars.first().evaluate((el) => (el as HTMLElement).style.height);
  }
}

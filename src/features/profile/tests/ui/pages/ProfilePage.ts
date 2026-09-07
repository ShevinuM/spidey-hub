import type { Page } from "@playwright/test";

/**
 * Page object for Profile.svelte (`e2e-testing.md` R003/R004: specs call
 * page-object getters/methods, never `page.locator(...)`/raw testid
 * strings directly). Named for the component it models, not the suite that
 * happens to use it (matching `TerminalPage`/`RepositoriesPage`
 * convention) — currently consumed only by the harness suite
 * (`tests/ui/harness/`), since the e2e suite's `profile.spec.ts` is a
 * verbatim-ported spec exempt from the page-object convention.
 */
export class ProfilePage {
  constructor(private readonly page: Page) {}

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

  /** Each of the 60 SIGNAL bars is an unmarked `<div>` — there's no stable
   * accessible role/text/testid for any ONE bar, only for the container
   * (`playwright.md` R001's rank-3 fallback: identify the container by
   * testid, then narrow structurally from there). */
  get meterBars() {
    return this.page.getByTestId("signal-meter-bars").locator("> div");
  }

  get statusBarWindows() {
    return this.page.getByTestId("status-bar-windows");
  }

  /** The first meter bar's live `style.height`, sampled once — callers
   * compare successive samples to prove the rAF loop is actually
   * running (an inline style write, not a class/attribute Playwright's
   * own locator assertions can match against). */
  firstBarHeight(): Promise<string> {
    return this.meterBars.first().evaluate((el) => (el as HTMLElement).style.height);
  }
}

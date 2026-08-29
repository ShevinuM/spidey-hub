import type { Page } from "@playwright/test";

/**
 * Page object for the root smoke tier (`e2e-testing.md` R003/R004:
 * specs call page-object methods/getters, never `page.locator(...)`
 * directly). `data-terminal-ready` is a functional readiness attribute
 * Terminal.svelte itself exposes — not a `data-testid` — so there is no
 * `getByTestId` alternative (`playwright.md` R002's "no CSS selector, ever"
 * is aimed at spec-level ad hoc selection; encapsulating the one selector
 * strategy an attribute like this actually needs, inside a page object, is
 * exactly what that page object exists for).
 */
export class SmokePage {
  constructor(private readonly page: Page) {}

  /** Exposed as a getter (R004), not a field — resolves lazily on each
   * access rather than being captured before the terminal even mounts. */
  get terminalReady() {
    return this.page.locator('[data-terminal-ready="true"]');
  }
}

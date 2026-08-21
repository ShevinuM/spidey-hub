// Behavioral e2e suite for Phase 10's Command Log removal + PanelBadge
// redesign (real, non-fixture build). Grown in step with the feature: this
// file starts with just the Command Log coverage; the PanelBadge
// composition/left-align/spacing suites land in later commits alongside
// their own fixes.
import { expect, test, type Page } from "./fixtures.ts";

async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

test.describe("Repositories: Command Log panel removed", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("no panel [5] / Command Log exists on /repositories", async ({ page }) => {
    await gotoReady(page, "/repositories");
    await expect(page.locator('[data-testid="repositories-panel-5"]')).toHaveCount(0);
    await expect(page.getByText("Command Log")).toHaveCount(0);
    // Pressing "5" (the old panel-5 focus key) must be a no-op now — no
    // panel exists to focus, and it must not throw/break other panels.
    await page.keyboard.press("0");
    await expect(page.locator('[data-testid="repositories-panel-0"]')).toHaveAttribute(
      "style",
      /border: 1px solid rgb\(224, 69, 60\)/,
    );
    await page.keyboard.press("5");
    // Panel 0 must STAY focused — "5" no longer moves focus anywhere.
    await expect(page.locator('[data-testid="repositories-panel-0"]')).toHaveAttribute(
      "style",
      /border: 1px solid rgb\(224, 69, 60\)/,
    );
  });
});

// The repo-list status dot sits in a fixed right-aligned column so its x position never drifts with name/branch length, and every row — including the virtual all-projects one — always renders one.
import { expect, test, type Page } from "../../../../../common/tests/ui/support/fixtures";

async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

test.describe("Repositories: status dot column alignment", () => {
  test.beforeEach(async ({ context }) => {
    // Keep the row list deterministic — no live GitHub fetch flipping any
    // row into its transient spinner state mid-test.
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("every visible repo row's status dot shares the same right edge", async ({ page }) => {
    await page.setViewportSize({ width: 1470, height: 842 });
    await gotoReady(page, "/repositories");

    const rows = page.locator('[data-testid="repositories-repo-row"]');
    await expect(rows.first()).toBeVisible();
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(1);

    const dotRights: number[] = [];
    for (let i = 0; i < rowCount; i++) {
      const dot = rows.nth(i).locator(
        '[data-testid="repositories-repo-idle-dot"], [data-testid="repositories-repo-open-dot"]',
      );
      if (await dot.count()) {
        const box = await dot.first().boundingBox();
        expect(box).not.toBeNull();
        if (box) dotRights.push(box.x + box.width);
      }
    }

    // Every row, all-projects included, must have contributed a dot.
    expect(dotRights.length).toBe(rowCount);

    const min = Math.min(...dotRights);
    const max = Math.max(...dotRights);
    expect(max - min).toBeLessThanOrEqual(1);
  });

  test("the all-projects row has a status dot, gold (open) by default on load", async ({ page }) => {
    await page.setViewportSize({ width: 1470, height: 842 });
    await gotoReady(page, "/repositories");

    const allProjectsRow = page.locator('[data-testid="repositories-repo-row"][data-all-projects="true"]');
    await expect(allProjectsRow).toBeVisible();
    // all-projects is pinned first and auto-opened by the mount effect, so
    // on a fresh load it is the active repo and gets the gold open-dot, not
    // the idle two-tone one.
    await expect(allProjectsRow.locator('[data-testid="repositories-repo-open-dot"]')).toHaveCount(1);
    await expect(allProjectsRow.locator('[data-testid="repositories-repo-idle-dot"]')).toHaveCount(0);
  });
});

// The row highlight tracks `selectedRepoIdx` alone, never gated on `focusedPanel`, matching FilesPanel.svelte's tree-row convention.
test.describe("Repositories: selection highlight matches actual selection on load", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("exactly one row is highlighted on first paint, and it is all-projects", async ({ page }) => {
    await gotoReady(page, "/repositories");

    const rows = page.locator('[data-testid="repositories-repo-row"]');
    const rowCount = await rows.count();
    const highlighted: string[] = [];
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const style = await row.getAttribute("style");
      // Selection is a red 2px left accent bar + gradient, not a flat
      // fill — this row's style attribute is still the raw SSR
      // literal here (no keyboard/click interaction precedes this check),
      // so a raw-text substring check on the border-left declaration is
      // correct, not merely tolerated.
      if (style && /border-left:2px solid #e0453c/.test(style)) {
        highlighted.push((await row.getAttribute("data-repo-name")) ?? "");
      }
    }
    expect(highlighted).toEqual(["all-projects"]);
  });
});

// ReposPanel's top padding matches Files/Content/Commits (18px) so the badge clears the first row by the same margin as the other panels.
test.describe("Repositories: first row clears the badge", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("panel [1]'s badge bottom edge sits comfortably above the first row", async ({ page }) => {
    await gotoReady(page, "/repositories");

    const badge = page.locator('[data-testid="repositories-panel-1"] [data-testid="panel-badge"]');
    const firstRow = page.locator('[data-testid="repositories-repo-row"]').first();
    const badgeBox = await badge.boundingBox();
    const rowBox = await firstRow.boundingBox();
    expect(badgeBox).toBeTruthy();
    expect(rowBox).toBeTruthy();
    if (badgeBox && rowBox) {
      const clearance = rowBox.y - (badgeBox.y + badgeBox.height);
      // The badge straddles the border via `translateY(-50%)` on a ~21px pill, so P px of top padding nets ~(P-10.5)px clearance; 18px nets ~7.5px, and 6px is comfortably below that without over-pinning the exact figure.
      expect(clearance).toBeGreaterThanOrEqual(6);
    }
  });
});

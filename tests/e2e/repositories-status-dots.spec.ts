// Regression coverage for the reported defect: "Those dots aren't right
// aligned like in the mock + all projects does not have a dot." Reference:
// the user's screenshot (~/Desktop/Screenshot 2026-08-21 at 2.54.30 AM.png),
// showing the repo-list status dot sitting in its own fixed, right-aligned
// column (so every row's dot lines up vertically) and the virtual
// `all-projects` row carrying no dot at all. (Builds-Panel-Changes.md:39-40
// covers the dot's pulse timing, not this column layout.)
//
// Before the fix, ReposPanel.svelte appended the dot inline immediately
// after the variable-length "{repo.key} {repo.branch}" text, so its x
// position drifted row to row with name/branch length instead of forming a
// column. This test pins the falsifiable signal: every visible dot's
// `getBoundingClientRect().right` must match across rows (within ~1px), and
// the `all-projects` row must render no dot element at all.
import { expect, test, type Page } from "./fixtures.ts";

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

    // Every non-all-projects row must have contributed a dot.
    expect(dotRights.length).toBe(rowCount - 1);

    const min = Math.min(...dotRights);
    const max = Math.max(...dotRights);
    expect(max - min).toBeLessThanOrEqual(1);
  });

  test("the all-projects row has no status dot", async ({ page }) => {
    await page.setViewportSize({ width: 1470, height: 842 });
    await gotoReady(page, "/repositories");

    const allProjectsRow = page.locator('[data-testid="repositories-repo-row"][data-all-projects="true"]');
    await expect(allProjectsRow).toBeVisible();
    await expect(
      allProjectsRow.locator('[data-testid="repositories-repo-idle-dot"], [data-testid="repositories-repo-open-dot"]'),
    ).toHaveCount(0);
  });
});

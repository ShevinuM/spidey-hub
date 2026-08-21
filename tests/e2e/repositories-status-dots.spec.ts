// Regression coverage for the reported defect: "Those dots aren't right
// aligned like in the mock." Reference: the user's screenshot
// (~/Desktop/Screenshot 2026-08-21 at 2.54.30 AM.png), showing the repo-list
// status dot sitting in its own fixed, right-aligned column (so every row's
// dot lines up vertically). (Builds-Panel-Changes.md:39-40 covers the dot's
// pulse timing, not this column layout.)
//
// Before the 856f455 fix, ReposPanel.svelte appended the dot inline
// immediately after the variable-length "{repo.key} {repo.branch}" text, so
// its x position drifted row to row with name/branch length instead of
// forming a column. This test pins the falsifiable signal: every visible
// dot's `getBoundingClientRect().right` must match across rows (within
// ~1px).
//
// CORRECTION: 856f455 also read the user's *separate* complaint — "I still
// don't see the yellow dot of all project" — backwards, and gated the dot
// off entirely for the virtual `all-projects` row (`!repo.isAllProjects` in
// ReposPanel.svelte). The user meant the dot was MISSING, not that it
// should be suppressed. That gate is now removed: all-projects gets a dot
// like every other row (idle two-tone, or the gold open-dot while it's the
// active repo — true by default on load, since all-projects is
// pinned first and auto-opened).
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

// Regression coverage for "the red selection bar despite it being the one
// in selection" — on a fresh load, `selectedRepoIdx` correctly points at
// all-projects (it's pinned first and auto-opened), but the row's own
// highlight style previously also required `state.focusedPanel === 1`,
// which defaults to 2 (Files). The visual highlight and the actual
// selection disagreed until the row was clicked (which sets focusedPanel
// to 1 as a side effect). Fix: the highlight now tracks selection alone,
// matching FilesPanel.svelte's own tree-row convention (its selected-row
// highlight never gated on panel focus either).
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
      if (style && /background:rgba\(224,69,60,\.22\)/.test(style)) {
        highlighted.push((await row.getAttribute("data-repo-name")) ?? "");
      }
    }
    expect(highlighted).toEqual(["all-projects"]);
  });
});

// Regression coverage for "why is all projects so close to the header with
// no padding" — the badge straddles the panel's own top border and hangs
// down into the panel body; ReposPanel's top padding (12px) left only ~2px
// of clearance before the first row, unlike Files/Content/Commits (already
// 18px). Raised to 18px to match.
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
      // Before the fix (12px top padding), this measured ~2px. The badge's
      // own straddling geometry (translateY(-50%) on a ~21px-tall pill)
      // means padding-top P nets P - ~10.5px of clearance — 18px (matching
      // Files/Content/Commits' own top padding, the "comparable clearance"
      // the panel never got) nets ~7.5px. Threshold set well above the
      // pre-fix value and just under that, so a regression back toward
      // 12px is caught but the actual achieved geometry isn't over-pinned.
      expect(clearance).toBeGreaterThanOrEqual(6);
    }
  });
});

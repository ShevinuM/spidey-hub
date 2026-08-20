// Regression coverage: `repositories-changes-body` (panel [3]'s file/doc
// preview) used bare `overflow:hidden` with no scroll affordance and no
// line-wrapping, so a long line rendered past the panel's right edge and got
// silently clipped by the ancestor's `overflow:hidden` — the same defect
// independently found on the Employment Records preview. Fix: the container
// switches to `overflow-y:auto;overflow-x:hidden`, and each line's content
// span gets `flex:1;min-width:0` (so it actually respects the row's width
// instead of growing to fit its own content) plus `white-space:pre-wrap;
// overflow-wrap:anywhere` (so it wraps instead of overflowing).
//
// Exercised against REAL (non-fixture) content — `pnpm generate` walks the
// actual git-submodule checkouts under `repos/` regardless of
// PORTFOLIO_FIXTURES (src/lib/highlight.ts + scripts/generate.mjs's
// generateRepoIndexes() has no fixture branch at all), so a real repo file
// already gives a genuinely long unbroken line without inventing fixture
// data that would have to live inside a vendored submodule checkout.
// Trees/Trie/word_search_ii.java (Data-Structures-And-Algorithms) is that
// file: 113 lines (enough to overflow vertically) with a real 574-character
// javadoc line at line 33 (enough to overflow horizontally without the fix).
import { expect, test, type Page } from "./fixtures.ts";

async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

async function openRepoTree(page: Page, repoName: string) {
  await page.locator(`[data-testid="repositories-repo-row"][data-repo-name="${repoName}"]`).click();
  await expect(page.locator('[data-testid="repositories-tree-row"]').first()).toBeVisible();
}

function treeRow(page: Page, name: string) {
  return page.locator(`[data-testid="repositories-tree-row"][data-entry-name="${name}"]`);
}

const REPO = "Data-Structures-And-Algorithms";
const FILE = "word_search_ii.java";

test.describe("Repositories preview: scroll + no horizontal clipping", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("the preview body scrolls vertically and clips no line horizontally", async ({ page }) => {
    await page.setViewportSize({ width: 1470, height: 842 });
    await gotoReady(page, "/repositories");
    await openRepoTree(page, REPO);
    await treeRow(page, FILE).click();
    // Line 33 is a real 574-character javadoc line — long enough to
    // overflow the panel's width at every viewport this app supports.
    const longLine = page.locator('[data-testid="repositories-preview-line"]').nth(32);
    await expect(longLine).toBeVisible();

    const body = page.locator('[data-testid="repositories-changes-body"]');
    await expect(body).toHaveCSS("overflow-y", "auto");

    const before = await body.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, scrollTop: el.scrollTop }));
    expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);
    expect(before.scrollTop).toBe(0);

    await body.hover();
    await page.mouse.wheel(0, 400);
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(before.scrollTop);

    // No horizontal clipping anywhere in the body, even with the 574-char
    // line rendered: content wraps instead of overflowing the ancestor.
    const overflowX = await body.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(overflowX.scrollWidth).toBeLessThanOrEqual(overflowX.clientWidth);
  });
});

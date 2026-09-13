// Exercised against real (non-fixture) content since `pnpm generate` fetches actual repo tarballs regardless of PORTFOLIO_FIXTURES; `word_search_ii.java` genuinely has a 574-char line (horizontal overflow) and 113 lines (vertical overflow) to check against.
import { expect, test, type Page } from "../../../../../common/tests/ui/support/fixtures";

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

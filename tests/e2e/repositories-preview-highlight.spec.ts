// Regression coverage: the Repositories (panel [3]) file preview discarded
// the Shiki token/palette data generate.mjs already writes into
// public/generated/repos/<name>.json, painting every non-markdown line one
// flat colour (repositoriesState.svelte.ts's old `previewLines`), while the
// full-screen Editor (same underlying `file` object) rendered it correctly.
// Fix: `PreviewState` now carries `tokens`/`palette` too, and
// `previewLines`/`previewPalette` resolve them the same way
// `editorLines`/`editorPalette` already did.
//
// Exercised against REAL (non-fixture) content: `pnpm generate` tokenizes
// every text file under the actual git-submodule checkouts in `repos/`,
// regardless of PORTFOLIO_FIXTURES (see src/lib/highlight.ts +
// scripts/generate.mjs's generateRepoIndexes(), which has no fixture branch
// at all) — so a real repo file already gives real, multi-colour tokens
// without inventing fixture data that would have to live inside a vendored
// submodule checkout. Trees/Trie/word_search_ii.java
// (Data-Structures-And-Algorithms) is that file: real Java keyword/type/
// comment tokens (multiple palette colours) on line 31 alone.
import { expect, test, type Page } from "./fixtures.ts";

async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

/** Mirrors tests/e2e/repositories.spec.ts's own helper: clicking a panel [1]
 * repo row both selects it and loads its working tree into panel [2]. */
async function openRepoTree(page: Page, repoName: string) {
  await page.locator(`[data-testid="repositories-repo-row"][data-repo-name="${repoName}"]`).click();
  await expect(page.locator('[data-testid="repositories-tree-row"]').first()).toBeVisible();
}

function treeRow(page: Page, name: string) {
  return page.locator(`[data-testid="repositories-tree-row"][data-entry-name="${name}"]`);
}

/** Every preview/editor line's colour spans are plain `<span style="color:...">`
 * elements with no testid of their own (mirrors EditorBuffer.svelte's own
 * token markup) — this reads back each one's COMPUTED color, scoped to
 * whichever wrapper locator is passed in. */
async function tokenColors(scope: ReturnType<Page["locator"]>): Promise<string[]> {
  return scope.locator("span").evaluateAll((els) => els.map((el) => getComputedStyle(el).color));
}

const REPO = "Data-Structures-And-Algorithms";
const FILE = "word_search_ii.java";

test.describe("Repositories preview: syntax highlighting", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("a previewed .java file renders more than one distinct token colour", async ({ page }) => {
    await gotoReady(page, "/repositories");
    await openRepoTree(page, REPO);
    await treeRow(page, FILE).click();
    await expect(page.locator('[data-testid="repositories-preview-line"]').first()).toBeVisible();
    // Preview only — the full-screen editor must not have opened.
    await expect(page.locator('[data-testid="editor-scroller"]')).toHaveCount(0);

    // Scoped to the tokenized-content wrapper's nested per-token spans only
    // (`[data-testid="repositories-preview-text"] span`) — NOT every span
    // under the body, which would also pick up the line-number gutter span's
    // own (always-present, unrelated) colour and pass even with zero real
    // syntax highlighting.
    const colors = await tokenColors(page.locator('[data-testid="repositories-preview-text"]'));
    expect(colors.length).toBeGreaterThan(0);
    expect(new Set(colors).size).toBeGreaterThan(1);
  });

  test("preview and full-screen editor render the SAME token colours for the same file+line", async ({ page }) => {
    await gotoReady(page, "/repositories");
    await openRepoTree(page, REPO);
    await treeRow(page, FILE).click();
    await expect(page.locator('[data-testid="repositories-preview-line"]').first()).toBeVisible();

    // Line 31 ("class Solution {") — a real code line with keyword + type
    // tokens, not the javadoc comment lines above it (which would still
    // pass but only exercise a single token colour).
    const previewLine31 = page.locator('[data-testid="repositories-preview-line"]').nth(30);
    await expect(previewLine31).toContainText("class Solution");
    const previewColors = await tokenColors(previewLine31.locator('[data-testid="repositories-preview-text"]'));
    expect(previewColors.length).toBeGreaterThan(1);

    await page.keyboard.press("2"); // focus panel [2] (Files)
    await page.keyboard.press("Enter"); // open the already-previewed file in the editor
    const scroller = page.locator('[data-testid="editor-scroller"]');
    await expect(scroller).toBeVisible();

    const editorLine31 = page.locator('[data-line="31"]');
    await expect(editorLine31).toContainText("class Solution");
    const editorColors = await tokenColors(editorLine31.locator('[data-testid="editor-line-text"]'));

    expect(editorColors).toEqual(previewColors);
  });
});

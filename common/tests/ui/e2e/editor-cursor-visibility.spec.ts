// Regression test: pressing j or other vim commands must never make the vim
// cursor disappear on some pages.
//
// Root cause (found via runtime repro, not static analysis): the editor's
// per-line row (Editor.svelte, the `<div data-line={l.n} ...>` the cursor
// span lives inside) never set `white-space:pre`, unlike its sibling
// CopyMode.svelte's equivalent row (`data-copy-mode-line`, which already has
// `white-space:pre`). Under the browser's default `white-space:normal`,
// leading whitespace (an indentation space/tab at the very start of a line's
// rendered content) collapses to zero width — so whenever the block cursor
// landed on a leading-indentation character (extremely common in real source
// files: any indented code line), the `[data-testid="editor-cursor"]` span
// still existed in the DOM (so most naive `toHaveCount(1)`-style assertions
// never caught it) but rendered as a 0x0 box, i.e. invisible. Plain prose
// fixtures (READMEs, role docs) rarely start a line with whitespace, which
// is why this went unnoticed on those pages and only reproduced on real
// indented source. Fixed by adding `white-space:pre` to that row, matching
// CopyMode's own convention.
//
// This spec deliberately opens a real, on-disk, indented source file (not a
// prose fixture) and drives the cursor onto a line that genuinely starts
// with a tab character, then asserts the cursor box has non-zero area —
// the exact symptom a plain `toHaveCount(1)` assertion would miss.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "../support/fixtures";

const ROOT = join(import.meta.dirname, "../../../..");

async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

const scroller = (page: Page) => page.locator('[data-testid="editor-scroller"]');
const editorCursor = (page: Page) => page.locator('[data-testid="editor-cursor"]');

/** Finds a tree row's flat index by walking `repositories-tree-row`s in DOM order
 * and matching a file directly nested one level under a named directory —
 * avoids ambiguity from repos that reuse a filename across directories. */
async function fileRowUnderDir(page: Page, dirName: string, fileName: string) {
  await expect(page.locator('[data-testid="repositories-tree-row"]').first()).toBeVisible();
  const rows = page.locator('[data-testid="repositories-tree-row"]');
  const count = await rows.count();
  let dirDepth = -1;
  let dirIdx = -1;
  for (let i = 0; i < count; i++) {
    if ((await rows.nth(i).getAttribute("data-entry-name")) === dirName) {
      dirDepth = Number(await rows.nth(i).getAttribute("data-depth"));
      dirIdx = i;
      break;
    }
  }
  expect(dirIdx, `directory "${dirName}" not found in the rendered tree`).toBeGreaterThanOrEqual(0);
  for (let i = dirIdx + 1; i < count; i++) {
    const depth = Number(await rows.nth(i).getAttribute("data-depth"));
    if (depth <= dirDepth) break;
    if ((await rows.nth(i).getAttribute("data-entry-name")) === fileName && depth === dirDepth + 1) {
      return rows.nth(i);
    }
  }
  throw new Error(`file "${fileName}" not found directly under "${dirName}"`);
}

test.describe("Editor cursor visibility (regression)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("block cursor stays visible when it lands on a leading-indentation character", async ({ page }) => {
    // The trailing full-file sweep below drives ~225 individual keypresses
    // plus a DOM measurement each, which comfortably clears Playwright's
    // default 30s test timeout in isolation but can brush against it under
    // CPU contention (parallel workers/other test files sharing the same
    // machine) — bump the budget rather than let an otherwise-passing
    // regression test flake under load.
    test.setTimeout(90_000);

    // Real, on-disk, indented JS source (not a prose README) — read at test
    // time from the SHA-pinned tarball cache scripts/generate.mjs populates
    // at `.cache/repos/<name>-<sha>/` (the pin comes from the committed
    // repos.json), so this can't drift from the actual repo content.
    const repoName = "Legend-of-Arlo-Guardians-Gauntlet";
    const relPath = "js/main.js";
    const pins = JSON.parse(readFileSync(join(ROOT, "repos.json"), "utf8")) as Record<string, string>;
    const sha = pins[repoName];
    const realLines = readFileSync(join(ROOT, ".cache/repos", `${repoName}-${sha}`, relPath), "utf8").split("\n");
    const indentedLineNo = realLines.findIndex((l) => /^[ \t]/.test(l)) + 1; // 1-based, vim convention
    expect(indentedLineNo, "fixture must contain at least one indented line for this test to be meaningful").toBeGreaterThan(0);

    await gotoReady(page, "/repositories");
    await page.locator(`[data-testid="repositories-repo-row"][data-repo-name="${repoName}"]`).click();
    const jsDir = page.locator('[data-testid="repositories-tree-row"][data-entry-name="js"]');
    await expect(jsDir).toBeVisible();
    const fileRow = await fileRowUnderDir(page, "js", "main.js");
    await fileRow.click();
    await page.keyboard.press("2");
    await page.keyboard.press("Enter");
    await expect(scroller(page)).toBeVisible();

    // Jump straight to the known indented line (`:N`-equivalent via `gg` +
    // `N` count + `j`, since the shared vim-lite engine's line-number ex
    // command isn't required here) and land column 0, which the real file
    // content confirms is a leading tab/space.
    await page.keyboard.press("g");
    await page.keyboard.press("g");
    for (let i = 1; i < indentedLineNo; i++) {
      await page.keyboard.press("j");
    }
    await page.keyboard.press("0");

    const cursor = editorCursor(page);
    await expect(cursor).toHaveCount(1);
    await expect(cursor).toBeVisible();
    const box = await cursor.boundingBox();
    expect(box, "cursor must have a real bounding box").not.toBeNull();
    expect(box!.width, "cursor collapsed to zero width on a leading-whitespace character").toBeGreaterThan(0);
    expect(box!.height, "cursor collapsed to zero height on a leading-whitespace character").toBeGreaterThan(0);

    // Sweep every remaining line in the file too (a broader net than the one
    // known line above) — the original bug reproduced on ANY line whose
    // first character was whitespace, not just this one.
    const lineCount = await page.locator("[data-line]").count();
    await page.keyboard.press("g");
    await page.keyboard.press("g");
    const cursorSelector = '[data-testid="editor-cursor"]';
    for (let i = 0; i < lineCount; i++) {
      // Single round-trip per line (one `evaluate` instead of a separate
      // `toHaveCount` + `boundingBox`) — halves the per-iteration cost of
      // this ~225-line sweep, which is what pushed the whole test past
      // Playwright's default timeout under load (see test.setTimeout above).
      const rect = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { width: r.width, height: r.height };
      }, cursorSelector);
      expect(rect, `cursor missing from the DOM on line ${i + 1}`).not.toBeNull();
      expect(rect!.width, `cursor collapsed to zero width on line ${i + 1}`).toBeGreaterThan(0);
      expect(rect!.height, `cursor collapsed to zero height on line ${i + 1}`).toBeGreaterThan(0);
      await page.keyboard.press("j");
    }
  });
});

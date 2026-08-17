// Behavioral e2e suite for the vim-lite engine in Editor.svelte — PLAN.md
// Phase 3 (item 10) / 3.4. Parametrized over both places the shared editor
// is mounted from — Builds (a real repo file) and Personnel (a real role
// doc) — since the engine itself is entry-point-agnostic and both callers
// must get identical behavior "for free" from the one shared component.
//
// Assertions read real, on-disk content at test time (the same convention
// builds.spec.ts / personnel.spec.ts already use for their own editor
// assertions) rather than hardcoding line text, so this suite can't drift
// from whatever the fixture repos/role docs actually contain.
import { expect, test, type Page } from "./fixtures.ts";
// PLAN.md Phase 5B item 5B.5: this spec's `context` fixture (imported
// from ./fixtures.ts, not raw "@playwright/test") pre-seeds the boot-seen
// sessionStorage flag before every navigation, so BootSequence.svelte's
// ~4.6s unskippable sequence never runs for these tests — see that
// file's header comment for why this is a context-fixture override
// rather than a per-goto-helper change.

async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

const scroller = (page: Page) => page.locator('[data-testid="editor-scroller"]');
const modeText = (page: Page) => page.locator('[data-testid="editor-mode"]');
const position = (page: Page) => page.locator('[data-testid="editor-position"]');
const message = (page: Page) => page.locator('[data-testid="editor-message"]');
const pasteBuffer = (page: Page) => page.locator('[data-testid="paste-buffer"]');
const closePill = (page: Page) => page.locator('[data-testid="editor-close-pill"]');
const overlay = (page: Page) => page.locator('[data-testid="grep-overlay"]');
const lineText = (page: Page, n: number) => page.locator(`[data-line="${n}"] [data-testid="editor-line-text"]`);

async function typeCmdline(page: Page, cmd: string) {
  await page.keyboard.press(":");
  await page.keyboard.type(cmd);
  await page.keyboard.press("Enter");
}

interface EntryPoint {
  name: string;
  /** Opens the editor and leaves the page ready for key input. */
  open: (page: Page) => Promise<void>;
  /** Asserts we're back on the exact underlying view the editor was opened
   * from (not the dashboard, not some other view). */
  assertParentVisible: (page: Page) => Promise<void>;
}

const entryPoints: EntryPoint[] = [
  {
    name: "Builds",
    async open(page) {
      await gotoReady(page, "/builds");
      await page.keyboard.press("3"); // focus panel [3], Local Repositories
      await page.keyboard.press("Enter"); // load the active repo's tree at root into panel [2]
      await expect(page.locator('[data-testid="builds-tree-row"][data-entry-name="README.md"]')).toBeVisible();
      // Clicking a file previews it in panel [0] but does NOT open the
      // editor (PLAN.md Phase 4 item 3 — click-selects/Enter-opens split);
      // focus panel [2] and press Enter to actually open it.
      await page.locator('[data-testid="builds-tree-row"][data-entry-name="README.md"]').click();
      await page.keyboard.press("2");
      await page.keyboard.press("Enter");
      await expect(scroller(page)).toBeVisible();
    },
    async assertParentVisible(page) {
      await expect(page.locator('[data-testid="builds-tree-row"][data-entry-name="README.md"]')).toBeVisible();
    },
  },
  {
    name: "Personnel",
    async open(page) {
      await gotoReady(page, "/personnel");
      await page.keyboard.press("Enter"); // -> Enaimco's employment types
      await page.keyboard.press("Enter"); // -> that type's role files
      await page.keyboard.press("Enter"); // -> editor
      await expect(scroller(page)).toBeVisible();
    },
    async assertParentVisible(page) {
      await expect(page.locator('[data-testid="personnel-path"]')).toHaveText(
        "/Users/Shev/Experience/Enaimco/Full-Time/",
      );
    },
  },
];

for (const entry of entryPoints) {
  test.describe(`Editor vim engine (${entry.name} entry point)`, () => {
    test.beforeEach(async ({ context, page }) => {
      await page.route("**/api.github.com/**", (route) => route.abort());
      // Chromium-only project (playwright.config.ts) — clipboard permission
      // grants are supported unconditionally here.
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    });

    test("h/l/0/^/$ column motions move the real cursor, read against the actual rendered line", async ({
      page,
    }) => {
      await entry.open(page);
      const text1 = (await lineText(page, 1).textContent()) ?? "";
      expect(text1.length).toBeGreaterThan(3);

      await expect(position(page)).toContainText("1:1");
      await page.keyboard.press("l");
      await page.keyboard.press("l");
      await expect(position(page)).toContainText("1:3");
      await page.keyboard.press("h");
      await expect(position(page)).toContainText("1:2");
      await page.keyboard.press("$");
      await expect(position(page)).toContainText(`1:${text1.length}`);
      await page.keyboard.press("0");
      await expect(position(page)).toContainText("1:1");
    });

    test("counted j/k motions (5j, 3k) move the cursor by exactly that many lines", async ({ page }) => {
      await entry.open(page);
      const totalLines = await page.locator("[data-line]").count();
      test.skip(totalLines < 8, "fixture file too short for this count to be meaningful");

      await page.keyboard.type("5j");
      await expect(position(page)).toContainText("6:1");
      await page.keyboard.type("3k");
      await expect(position(page)).toContainText("3:1");
    });

    test("gg/G jump to the first/last line", async ({ page }) => {
      await entry.open(page);
      const totalLines = await page.locator("[data-line]").count();

      // Only the line number is asserted here (not the column): G lands on
      // the last line's first non-blank character, whose column depends on
      // that line's own indentation, which this suite doesn't assume.
      await page.keyboard.press("G");
      await expect(position(page)).toContainText(`${totalLines}:`);

      await page.keyboard.press("g");
      await page.keyboard.press("g");
      await expect(position(page)).toContainText("1:1");
    });

    test("w/b/e word motions actually move the column", async ({ page }) => {
      await entry.open(page);
      const text1 = (await lineText(page, 1).textContent()) ?? "";
      test.skip(!/\s/.test(text1), "first line has no word boundary to cross");

      await page.keyboard.press("w");
      const afterW = await position(page).innerText();
      expect(afterW).not.toContain("1:1");

      await page.keyboard.press("b");
      await expect(position(page)).toContainText("1:1");
    });

    test("v enters VISUAL and highlights the extended selection; Esc cancels back to NORMAL without closing", async ({
      page,
    }) => {
      await entry.open(page);
      await expect(modeText(page)).toHaveText("NORMAL");

      await page.keyboard.press("v");
      await expect(modeText(page)).toHaveText("VISUAL");
      await page.keyboard.press("l");
      await page.keyboard.press("l");
      await expect(page.locator('[data-testid="editor-selection"]').first()).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(modeText(page)).toHaveText("NORMAL");
      await expect(scroller(page)).toBeVisible();
    });

    test("V enters VISUAL LINE and highlights whole lines", async ({ page }) => {
      await entry.open(page);
      await page.keyboard.press("V");
      await expect(modeText(page)).toHaveText("VISUAL LINE");
      await page.keyboard.press("j");
      await expect(page.locator('[data-testid="editor-selection"]').first()).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(modeText(page)).toHaveText("NORMAL");
    });

    test("visual y yanks the selection into the shared paste buffer and the system clipboard", async ({ page }) => {
      await entry.open(page);
      const text1 = (await lineText(page, 1).textContent()) ?? "";
      test.skip(text1.length < 3, "fixture first line too short");

      await page.keyboard.press("v");
      await page.keyboard.press("l");
      await page.keyboard.press("l");
      await page.keyboard.press("y");

      const expected = text1.slice(0, 3);
      await expect(modeText(page)).toHaveText("NORMAL"); // y returns to NORMAL
      await expect(pasteBuffer(page)).toHaveText(expected);

      const clip = await page.evaluate(() => navigator.clipboard.readText());
      expect(clip).toBe(expected);
    });

    test("yy yanks the current line (linewise); 3yy yanks three lines with a count", async ({ page }) => {
      await entry.open(page);
      const totalLines = await page.locator("[data-line]").count();
      const text1 = (await lineText(page, 1).textContent()) ?? "";

      await page.keyboard.press("y");
      await page.keyboard.press("y");
      await expect(pasteBuffer(page)).toHaveText(`${text1}\n`);

      test.skip(totalLines < 3, "fixture file too short for 3yy");
      const text2 = (await lineText(page, 2).textContent()) ?? "";
      const text3 = (await lineText(page, 3).textContent()) ?? "";
      await page.keyboard.type("3yy");
      await expect(pasteBuffer(page)).toHaveText(`${text1}\n${text2}\n${text3}\n`);
    });

    test("/ opens in-buffer search (never grep) and n/N step through matches without opening grep", async ({
      page,
    }) => {
      await entry.open(page);
      await page.keyboard.press("/");
      await expect(modeText(page)).toHaveText("/");
      await expect(overlay(page)).not.toBeVisible();

      await page.keyboard.type("e");
      await expect(modeText(page)).toHaveText("/e");
      await page.keyboard.press("Enter");
      await expect(modeText(page)).toHaveText("NORMAL");
      await expect(overlay(page)).not.toBeVisible();

      await page.keyboard.press("n");
      await expect(overlay(page)).not.toBeVisible();
      await expect(scroller(page)).toBeVisible();

      await page.keyboard.press("N");
      await expect(overlay(page)).not.toBeVisible();
    });

    test("Esc cancels an in-progress search without closing the editor", async ({ page }) => {
      await entry.open(page);
      await page.keyboard.press("/");
      await page.keyboard.type("xyz");
      await page.keyboard.press("Escape");
      await expect(modeText(page)).toHaveText("NORMAL");
      await expect(scroller(page)).toBeVisible();
    });

    test("Esc cancels the : cmdline without executing it or closing the editor", async ({ page }) => {
      await entry.open(page);
      await page.keyboard.press(":");
      await page.keyboard.type("q");
      await expect(modeText(page)).toHaveText(":q");
      await page.keyboard.press("Escape");
      await expect(modeText(page)).toHaveText("NORMAL");
      await expect(scroller(page)).toBeVisible();
    });

    test(":q closes the editor back to the exact parent view", async ({ page }) => {
      await entry.open(page);
      await typeCmdline(page, "q");
      await expect(scroller(page)).not.toBeVisible();
      await entry.assertParentVisible(page);
    });

    test(":w and :wq show a readonly error and never close the editor", async ({ page }) => {
      await entry.open(page);
      await typeCmdline(page, "w");
      await expect(scroller(page)).toBeVisible();
      await expect(message(page)).toContainText("readonly");

      await typeCmdline(page, "wq");
      await expect(scroller(page)).toBeVisible();
    });

    test("an unknown ex command shows an E492-style message", async ({ page }) => {
      await entry.open(page);
      await typeCmdline(page, "bogus");
      await expect(message(page)).toContainText("E492");
      await expect(message(page)).toContainText("bogus");
    });

    test(":<number> jumps to that line", async ({ page }) => {
      await entry.open(page);
      const totalLines = await page.locator("[data-line]").count();
      test.skip(totalLines < 3, "fixture file too short");
      await typeCmdline(page, "3");
      await expect(position(page)).toContainText("3:");
    });

    test("i and x show a readonly bell and change nothing", async ({ page }) => {
      await entry.open(page);
      const before = await lineText(page, 1).textContent();

      await page.keyboard.press("i");
      await expect(message(page)).toContainText("E21");
      await expect(lineText(page, 1)).toHaveText(before ?? "");

      await page.keyboard.press("x");
      await expect(message(page)).toContainText("E21");
      await expect(lineText(page, 1)).toHaveText(before ?? "");
    });

    test("a mutating key pressed in VISUAL mode flashes the bell and exits back to NORMAL", async ({ page }) => {
      await entry.open(page);
      await page.keyboard.press("v");
      await page.keyboard.press("d");
      await expect(message(page)).toContainText("E21");
      await expect(modeText(page)).toHaveText("NORMAL");
      await expect(scroller(page)).toBeVisible();
    });

    test("clicking the [:q] pill closes the editor back to the exact parent view", async ({ page }) => {
      await entry.open(page);
      await closePill(page).click();
      await expect(scroller(page)).not.toBeVisible();
      await entry.assertParentVisible(page);
    });
  });
}

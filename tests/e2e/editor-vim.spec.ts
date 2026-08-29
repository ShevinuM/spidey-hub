// Behavioral e2e suite for the vim-lite engine in Editor.svelte.
// Parametrized over both places the shared editor
// is mounted from — Repositories (a real repo file) and Employment (a real role
// doc) — since the engine itself is entry-point-agnostic and both callers
// must get identical behavior "for free" from the one shared component.
//
// Assertions read real, on-disk content at test time (the same convention
// repositories.spec.ts / employment.spec.ts already use for their own editor
// assertions) rather than hardcoding line text, so this suite can't drift
// from whatever the fixture repos/role docs actually contain.
import { expect, test, type Page } from "../../common/tests/ui/support/fixtures.ts";
// This spec's `context` fixture (imported
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
// The `:` ex-command line's PRESENTATION (the typed text, the resulting
// readonly/E492 error) lives in the site-wide floating Cmdline box, not
// Editor.svelte's own footer — see Cmdline.svelte /
// tests/e2e/cmdline.spec.ts for that box's own dedicated coverage; the
// assertions below read these locators for ex-command-specific output.
const cmdlineOverlay = (page: Page) => page.locator('[data-testid="cmdline-overlay"]');
const cmdlineInput = (page: Page) => page.locator('[data-testid="cmdline-input"]');
const cmdlineError = (page: Page) => page.locator('[data-testid="cmdline-error"]');

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
    name: "Repositories",
    async open(page) {
      await gotoReady(page, "/repositories");
      // The default-highlighted panel [1] repo is the virtual "all-projects"
      // entry, not a real repo, so pressing Enter on the default highlight
      // does not load a real repo's tree. The Files pane also renders the
      // FULL nested tree at once, and daily-tech-digest genuinely has two
      // files named "README.md" (root + "site/README.md") simultaneously
      // visible in that tree, which would make the locator below ambiguous.
      // transcript-tts has exactly one README.md and no nested duplicate, so
      // clicking its panel [1] row directly (which both selects it AND loads
      // its tree) sidesteps both issues.
      await page.locator('[data-testid="repositories-repo-row"][data-repo-name="transcript-tts"]').click();
      await expect(page.locator('[data-testid="repositories-tree-row"][data-entry-name="README.md"]')).toBeVisible();
      // Clicking a file previews it in panel [3] but does NOT open the
      // editor (click-selects/Enter-opens split); focus panel [2] and press
      // Enter to actually open it.
      await page.locator('[data-testid="repositories-tree-row"][data-entry-name="README.md"]').click();
      await page.keyboard.press("2");
      await page.keyboard.press("Enter");
      await expect(scroller(page)).toBeVisible();
    },
    async assertParentVisible(page) {
      await expect(page.locator('[data-testid="repositories-tree-row"][data-entry-name="README.md"]')).toBeVisible();
    },
  },
  {
    name: "Employment",
    async open(page) {
      // v2 (flat list + timeline):
      // no more drill-down — row 0 (newest: Enaimco's Software Developer) is
      // selected by default, so a single Enter opens its role.md directly.
      await gotoReady(page, "/employment");
      await expect(page.locator('[data-testid="employment-row"]').first()).toBeVisible();
      await page.keyboard.press("Enter"); // -> editor
      await expect(scroller(page)).toBeVisible();
    },
    async assertParentVisible(page) {
      // There is no `employment-path` breadcrumb element. Anchor instead
      // (same convention employment.spec.ts's own `rowLocator` uses): the
      // flat list's row 0 is back, still selected (its own preview path is
      // the exact file this entry point opened) — proving we're back on the
      // Employment Records list, not the dashboard or some other view.
      await expect(page.locator('[data-testid="employment-row"]').first()).toBeVisible();
      await expect(page.locator('[data-testid="employment-preview-path"]')).toHaveText("enaimco/software-developer.md");
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

    test("Esc cancels the : cmdline (now the Cmdline box) without executing it or closing the editor", async ({
      page,
    }) => {
      await entry.open(page);
      // The footer mode indicator does not show the typed ex-command text
      // (that presentation lives in the box) — it stays "NORMAL" throughout,
      // since the editor's own mode never
      // actually changes for `:` anymore (see Editor.svelte's own comment
      // on that key).
      await expect(modeText(page)).toHaveText("NORMAL");
      await page.keyboard.press(":");
      await expect(cmdlineOverlay(page)).toBeVisible();
      await page.keyboard.type("q");
      await expect(cmdlineInput(page)).toContainText("q");
      await expect(modeText(page)).toHaveText("NORMAL");
      await page.keyboard.press("Escape");
      await expect(cmdlineOverlay(page)).not.toBeVisible();
      await expect(modeText(page)).toHaveText("NORMAL");
      await expect(scroller(page)).toBeVisible();
    });

    test(":q closes the editor back to the exact parent view", async ({ page }) => {
      await entry.open(page);
      await typeCmdline(page, "q");
      await expect(cmdlineOverlay(page)).not.toBeVisible();
      await expect(scroller(page)).not.toBeVisible();
      await entry.assertParentVisible(page);
    });

    // Regression test (live-reproduced defect): an active VISUAL/VISUAL-LINE
    // selection must drop to NORMAL AT BOX-OPEN TIME when `:` is pressed —
    // otherwise the selection stays alive underneath the box, so a
    // subsequent `:<n>` jump would EXTEND the selection instead of moving a
    // bare cursor. Asserted immediately after pressing `:`, before typing or
    // executing any command, so this can't pass by coincidence of the
    // command itself happening to reset the mode.
    test("`:` from VISUAL drops the selection to NORMAL at box-open time; :<n> does not extend it", async ({
      page,
    }) => {
      await entry.open(page);
      const totalLines = await page.locator("[data-line]").count();
      test.skip(totalLines < 5, "fixture file too short for :5 to be meaningful");

      await page.keyboard.press("v");
      await page.keyboard.press("l");
      await page.keyboard.press("l");
      await page.keyboard.press("l");
      await expect(modeText(page)).toHaveText("VISUAL");
      await expect(page.locator('[data-testid="editor-selection"]')).not.toHaveCount(0);

      await page.keyboard.press(":");
      await expect(cmdlineOverlay(page)).toBeVisible();
      await expect(modeText(page)).toHaveText("NORMAL");
      await expect(page.locator('[data-testid="editor-selection"]')).toHaveCount(0);

      await page.keyboard.type("5");
      await page.keyboard.press("Enter");
      await expect(cmdlineOverlay(page)).not.toBeVisible();
      await expect(position(page)).toContainText("5:");
      await expect(modeText(page)).toHaveText("NORMAL");
      await expect(page.locator('[data-testid="editor-selection"]')).toHaveCount(0);
    });

    test("`:` from VISUAL LINE drops the selection to NORMAL at box-open time (shared mode state)", async ({
      page,
    }) => {
      await entry.open(page);
      const totalLines = await page.locator("[data-line]").count();
      test.skip(totalLines < 5, "fixture file too short for :5 to be meaningful");

      await page.keyboard.press("V");
      await page.keyboard.press("j");
      await expect(modeText(page)).toHaveText("VISUAL LINE");
      await expect(page.locator('[data-testid="editor-selection"]')).not.toHaveCount(0);

      await page.keyboard.press(":");
      await expect(cmdlineOverlay(page)).toBeVisible();
      await expect(modeText(page)).toHaveText("NORMAL");
      await expect(page.locator('[data-testid="editor-selection"]')).toHaveCount(0);

      await page.keyboard.type("5");
      await page.keyboard.press("Enter");
      await expect(position(page)).toContainText("5:");
      await expect(page.locator('[data-testid="editor-selection"]')).toHaveCount(0);
    });

    test(":w and :wq show a readonly error IN THE BOX and never close the editor", async ({ page }) => {
      await entry.open(page);
      await typeCmdline(page, "w");
      await expect(scroller(page)).toBeVisible();
      await expect(cmdlineError(page)).toContainText("readonly");
      // Editor.svelte's own footer message is unaffected by ex-command
      // output — only NORMAL-mode mutating-key bells (i/x/etc, tested
      // below) use it.
      await expect(message(page)).not.toBeVisible();

      await page.keyboard.press("Escape"); // dismiss the box's error and close it
      await typeCmdline(page, "wq");
      await expect(cmdlineError(page)).toContainText("readonly");
      await expect(scroller(page)).toBeVisible();
    });

    // The bang variants report the same E45 readonly error as their
    // bang-less forms, never the unknown-command E492 branch.
    test(":wq! shows the E45 readonly error, not E492, and never closes the editor", async ({ page }) => {
      await entry.open(page);
      await typeCmdline(page, "wq!");
      await expect(cmdlineError(page)).toContainText("E45");
      await expect(cmdlineError(page)).not.toContainText("E492");
      await expect(scroller(page)).toBeVisible();
    });

    test("an unknown ex command shows an E492-style message IN THE BOX", async ({ page }) => {
      await entry.open(page);
      await typeCmdline(page, "bogus");
      await expect(cmdlineError(page)).toContainText("E492");
      await expect(cmdlineError(page)).toContainText("bogus");
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

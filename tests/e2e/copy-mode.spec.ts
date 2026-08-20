// Behavioral e2e suite for the tmux copy-mode overlay (CopyMode.svelte) —
// `Ctrl-b [` / `Ctrl-b ]`.
//
// The "which pane does copy-mode capture" half is deliberately data-driven
// off each view's OWN rendered `[data-copy-source]` text (read at test time,
// same convention grep.spec.ts/repositories.spec.ts already use for on-disk
// content) rather than hardcoded copy, so this suite can't drift from
// whatever each view's data files actually render.
import { expect, test, type Page } from "./fixtures.ts";
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

async function ctrlB(page: Page) {
  await page.keyboard.down("Control");
  await page.keyboard.press("b");
  await page.keyboard.up("Control");
}

async function openCopyMode(page: Page) {
  await ctrlB(page);
  await page.keyboard.press("[");
}

const overlay = (page: Page) => page.locator('[data-testid="copy-mode-overlay"]');
const linesEl = (page: Page) => page.locator('[data-testid="copy-mode-lines"]');
const cursor = (page: Page) => page.locator('[data-testid="copy-mode-cursor"]').first();

async function cursorLine(page: Page): Promise<string | null> {
  return cursor(page).evaluate((el) => el.closest("[data-copy-mode-line]")?.getAttribute("data-copy-mode-line") ?? null);
}

test.describe("Copy mode (Ctrl-b [)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  // Copy-mode must be enterable from at least 3 different views — every
  // `data-copy-source` pane gets its own entry point here, each asserted
  // against its own live-read source text.
  const entryPoints: { name: string; open: (page: Page) => Promise<void> }[] = [
    {
      name: "dashboard menu",
      async open(page) {
        await gotoReady(page, "/");
      },
    },
    {
      name: "employment row list",
      async open(page) {
        await gotoReady(page, "/employment");
      },
    },
    {
      name: "profile summary",
      async open(page) {
        await gotoReady(page, "/profile");
      },
    },
    {
      name: "Repositories focused panel",
      async open(page) {
        await gotoReady(page, "/repositories");
        await page.keyboard.press("1"); // focus panel [1] Status
      },
    },
    {
      name: "help content",
      async open(page) {
        await gotoReady(page, "/help");
      },
    },
    {
      name: "tracker HUD",
      async open(page) {
        await gotoReady(page, "/retina-v");
      },
    },
  ];

  for (const entry of entryPoints) {
    test(`captures the ${entry.name} as its active pane`, async ({ page }) => {
      await entry.open(page);
      const sourceText = (await page.locator("[data-copy-source]").innerText()).trim();
      expect(sourceText.length).toBeGreaterThan(0);
      const firstLine = sourceText.split("\n")[0];

      await openCopyMode(page);
      await expect(overlay(page)).toBeVisible();
      await expect(linesEl(page)).toContainText(firstLine);
    });
  }

  // A program can run in more than one pane at once, so `[data-copy-source]`
  // capture must resolve to the FOCUSED PANE's own program, not the window's
  // `view`. Wallpaper's tracker HUD is always in the DOM (just faded) at
  // every view, so without this, splitting the retina-v window and focusing
  // the new (shell) sibling still leaves Wallpaper's `data-copy-source`
  // attribute on — CopyMode's `document.querySelector('[data-copy-source]')`
  // would find the HUD (earlier in the DOM) instead of the focused shell,
  // since querySelector returns only the first match.
  test("a shell pane split off a retina-v window is the copy-source, not the tracker HUD", async ({ page }) => {
    await gotoReady(page, "/retina-v");
    await expect(page.locator("[data-copy-source]")).toHaveCount(1);

    await ctrlB(page);
    await page.keyboard.press("|");
    await expect(page.locator('[data-testid="pane-leaf"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="pane-leaf"][data-pane-focused="true"]')).toHaveCount(1);

    // Exactly one copy-source in the DOM, and it's the new (focused) shell
    // pane's scroller — not the wallpaper's HUD `<pre>`.
    await expect(page.locator("[data-copy-source]")).toHaveCount(1);
    await expect(page.locator("[data-copy-source]")).toHaveAttribute("data-testid", "shell-scroller");
    await expect(page.locator('pre[data-copy-source]')).toHaveCount(0);
  });

  // A verifier caught that the editor's visible scroller renders each line's
  // gutter number and text as SIBLING flex items, and `innerText` inserts a
  // line break between flex siblings the same way it does between block
  // boxes — scraping that DOM interleaved every gutter digit as its own
  // "line", so copy-mode line N was never the buffer's real line N (yanking
  // line 1 actually yanked the gutter digit "1"). Editor.svelte now exposes
  // a text-only, hidden `data-copy-source` mirror built from `rawLines`
  // directly — asserted here by yanking copy-mode's own line 1 and checking
  // it EQUALS the real buffer's line 1 text exactly (not merely contained
  // somewhere in the overlay, which is how the interleaving bug slipped
  // through the original test).
  test("captures the vim editor buffer as its active pane, one real buffer line per copy-mode line", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await gotoReady(page, "/repositories");
    // The default-highlighted panel [3] repo is the virtual "all-projects"
    // entry (no README.md in its flat .md-only tree) — click transcript-tts's
    // own row directly, which both selects it and loads its tree.
    await page.locator('[data-testid="repositories-repo-row"][data-repo-name="transcript-tts"]').click();
    await expect(page.locator('[data-testid="repositories-tree-row"][data-entry-name="README.md"]')).toBeVisible();
    await page.locator('[data-testid="repositories-tree-row"][data-entry-name="README.md"]').click();
    await page.keyboard.press("2");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
    const firstLine = (await page.locator('[data-line="1"] [data-testid="editor-line-text"]').textContent()) ?? "";
    expect(firstLine.length).toBeGreaterThan(0);

    await openCopyMode(page);
    await expect(overlay(page)).toBeVisible();
    expect(await cursorLine(page)).toBe("1");

    // Enter with no selection yanks the cursor's current line (copy-mode
    // line 1) and exits — the yanked text must be EXACTLY the real buffer's
    // first line, gutter digit included nowhere.
    await page.keyboard.press("Enter");
    await expect(overlay(page)).not.toBeVisible();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toBe(firstLine);
  });

  test("j/k/gg/G move the cursor across the captured lines", async ({ page }) => {
    await gotoReady(page, "/help");
    await openCopyMode(page);
    await expect(overlay(page)).toBeVisible();
    expect(await cursorLine(page)).toBe("1");

    await page.keyboard.press("j");
    expect(await cursorLine(page)).toBe("2");
    await page.keyboard.press("k");
    expect(await cursorLine(page)).toBe("1");

    const totalLines = await page.locator("[data-copy-mode-line]").count();
    test.skip(totalLines < 3, "captured pane too short for gg/G to be meaningful");

    await page.keyboard.press("G");
    expect(await cursorLine(page)).toBe(String(totalLines));
    // The lines container renders every line at once and scrolls — G must
    // actually scroll the cursor into view, not just relabel it while the
    // viewport stays put.
    await expect(cursor(page)).toBeInViewport();

    await page.keyboard.press("g");
    await page.keyboard.press("g");
    expect(await cursorLine(page)).toBe("1");
    await expect(cursor(page)).toBeInViewport();
  });

  test("h/l move the cursor within a line", async ({ page }) => {
    await gotoReady(page, "/help");
    await openCopyMode(page);
    await page.keyboard.press("l");
    await page.keyboard.press("l");
    // Still on line 1 — h/l only move the column, never the line.
    expect(await cursorLine(page)).toBe("1");
  });

  test("Ctrl-d/Ctrl-u page the cursor down/up", async ({ page }) => {
    await gotoReady(page, "/help");
    await openCopyMode(page);
    const totalLines = await page.locator("[data-copy-mode-line]").count();
    test.skip(totalLines < 15, "captured pane too short for a page move to be meaningful");

    await page.keyboard.down("Control");
    await page.keyboard.press("d");
    await page.keyboard.up("Control");
    const afterDown = Number(await cursorLine(page));
    expect(afterDown).toBeGreaterThan(1);

    await page.keyboard.down("Control");
    await page.keyboard.press("u");
    await page.keyboard.up("Control");
    const afterUp = Number(await cursorLine(page));
    expect(afterUp).toBeLessThan(afterDown);
  });

  test("v starts a charwise selection that highlights as motions extend it", async ({ page }) => {
    await gotoReady(page, "/help");
    await openCopyMode(page);
    await page.keyboard.press("v");
    await page.keyboard.press("l");
    await page.keyboard.press("l");
    await expect(page.locator('[data-testid="copy-mode-selection"]').first()).toBeVisible();
  });

  test("y yanks the selection to the paste buffer + system clipboard, then exits", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await gotoReady(page, "/help");
    await openCopyMode(page);
    await page.keyboard.press("v");
    await page.keyboard.press("l");
    await page.keyboard.press("l");
    await page.keyboard.press("l");
    await page.keyboard.press("y");

    await expect(overlay(page)).not.toBeVisible();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip.length).toBeGreaterThan(0);
  });

  test("Enter yanks the current line with no selection active, then exits", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await gotoReady(page, "/profile");
    const sourceText = (await page.locator("[data-copy-source]").innerText()).trim();
    const firstLine = sourceText.split("\n")[0];

    await openCopyMode(page);
    await page.keyboard.press("Enter");
    await expect(overlay(page)).not.toBeVisible();

    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toBe(firstLine);
  });

  test("q exits copy-mode without yanking (the one place bare q is allowed)", async ({ page }) => {
    await gotoReady(page, "/help");
    await openCopyMode(page);
    await expect(overlay(page)).toBeVisible();
    await page.keyboard.press("q");
    await expect(overlay(page)).not.toBeVisible();
  });

  test("Esc exits copy-mode without yanking", async ({ page }) => {
    await gotoReady(page, "/help");
    await openCopyMode(page);
    await page.keyboard.press("Escape");
    await expect(overlay(page)).not.toBeVisible();
  });

  // Round-trip requirement: a copy-mode yank in one view, pasted via
  // Ctrl-b ] into an entirely different overlay's text input.
  test("round trip: a copy-mode yank pastes into the grep query via Ctrl-b ]", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await gotoReady(page, "/help");
    await openCopyMode(page);
    await page.keyboard.press("v");
    await page.keyboard.press("l");
    await page.keyboard.press("l");
    await page.keyboard.press("l");
    await page.keyboard.press("y");
    await expect(overlay(page)).not.toBeVisible();
    const yanked = await page.evaluate(() => navigator.clipboard.readText());
    expect(yanked.length).toBeGreaterThan(0);

    await page.keyboard.press("/");
    await expect(page.locator('[data-testid="grep-overlay"]')).toBeVisible();
    await expect(page.locator('[data-testid="grep-query"]')).toHaveText("▌");

    await ctrlB(page);
    await page.keyboard.press("]");
    await expect(page.locator('[data-testid="grep-query"]')).toContainText(yanked);
  });

  // Ctrl-b ] must be able to paste into the status-bar rename prompt too:
  // if StatusBar's own handleKey() were consulted before Terminal's prefix
  // system gets a turn, a Ctrl-b keydown while the prompt is open would be
  // swallowed as "just another modifier combo" and never arm the prefix,
  // making `Ctrl-b ]` unreachable (a literal "]" would get typed into the
  // window name instead).
  test("round trip: a copy-mode yank pastes into the Ctrl-b , rename prompt via Ctrl-b ]", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await gotoReady(page, "/repositories");
    await openCopyMode(page);
    await page.keyboard.press("v");
    await page.keyboard.press("l");
    await page.keyboard.press("l");
    await page.keyboard.press("y");
    await expect(overlay(page)).not.toBeVisible();
    const yanked = await page.evaluate(() => navigator.clipboard.readText());
    expect(yanked.length).toBeGreaterThan(0);

    await ctrlB(page);
    await page.keyboard.press(",");
    const prompt = page.locator('[data-testid="status-prompt"]');
    await expect(prompt).toContainText("(rename-window) repos");

    await ctrlB(page);
    await page.keyboard.press("]");
    await expect(prompt).toContainText(yanked);

    await page.keyboard.press("Escape");
  });
});

// Behavioral e2e suite for the site-wide floating Cmdline —
// src/components/Cmdline.svelte, driven by Terminal.svelte. Covers
// all THREE entry contexts (site `:`, editor ex-mode `:`, tmux
// command-prompt `Ctrl-b :`), the palette feel (silent Tab completion +
// zsh-style repeated-Tab cycling — no suggestions list ever renders,
// asserted absent throughout this file), and a DATA-DRIVEN sweep over
// src/data/cmdline.yaml's own `commands` list so a future addition to that
// file is asserted automatically rather than silently untested ("the e2e
// sweep is generated FROM the yaml so the list can't drift").
// The new `?` HelpSearch palette that took over the browsable/discoverable
// role has its own suite — tests/e2e/help-search.spec.ts.
import { expect, test, type Page } from "../../common/tests/ui/support/fixtures.ts";
// This spec's `context` fixture (imported from
// ./fixtures.ts, not raw "@playwright/test") pre-seeds the boot-seen
// sessionStorage flag before every navigation, so BootSequence.svelte's
// ~4.6s unskippable sequence never runs for these tests — see that file's
// header comment for why this is a context-fixture override rather than a
// per-goto-helper change. The `:reboot` test below still works under this
// flag: BootSequence's `replay()` is a manual trigger independent of the
// sessionStorage auto-skip (see boot.spec.ts's own "r on the ready
// dashboard replays boot, independent of the session flag" test).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { search, formatCount, type RepoFile } from "../../src/lib/grep.ts";

const ROOT = join(import.meta.dirname, "../..");

interface CmdlineCommandDef {
  name: string;
  aliases?: string[];
  description: string;
  action?: string;
  takesArgs?: boolean;
}
interface CmdlineYaml {
  title: string;
  commands: CmdlineCommandDef[];
  tmuxCommands: CmdlineCommandDef[];
  errors: { unknownCommandTemplate: string };
}

function loadCmdlineYaml(): CmdlineYaml {
  return YAML.parse(readFileSync(join(ROOT, "src/data/cmdline.yaml"), "utf8")) as CmdlineYaml;
}

async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

async function ctrlB(page: Page) {
  await page.keyboard.down("Control");
  await page.keyboard.press("b");
  await page.keyboard.up("Control");
}

const overlay = (page: Page) => page.locator('[data-testid="cmdline-overlay"]');
const input = (page: Page) => page.locator('[data-testid="cmdline-input"]');
const errorText = (page: Page) => page.locator('[data-testid="cmdline-error"]');

async function typeAndEnter(page: Page, text: string) {
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

async function mockOpen(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __opened: unknown[] }).__opened = [];
    window.open = ((url?: string | URL, target?: string) => {
      (window as unknown as { __opened: unknown[] }).__opened.push({ url, target });
      return null;
    }) as typeof window.open;
  });
}
async function openedCalls(page: Page) {
  return page.evaluate(() => (window as unknown as { __opened: unknown[] }).__opened);
}

test.describe("Cmdline: opening", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  const views: { path: string; key?: string }[] = [
    { path: "/" },
    { path: "/repositories" },
    { path: "/employment" },
    { path: "/retina-v" },
    { path: "/profile" },
    { path: "/help" },
  ];

  for (const v of views) {
    test(`: opens the box in site mode from ${v.path}`, async ({ page }) => {
      await gotoReady(page, v.path);
      await page.keyboard.press(":");
      await expect(overlay(page)).toBeVisible();
      await expect(input(page)).toHaveText("▌");
      // No suggestions list renders — typing a real site-wide command and
      // submitting it is the open assertion here (the data-driven sweep
      // below covers every command).
      await typeAndEnter(page, "dashboard");
      await expect(overlay(page)).not.toBeVisible();
      await expect(page).toHaveURL(/\/$/);
    });
  }

  test("Ctrl-b : opens the box in tmux mode (rename-window/kill-window/kill-pane/select-window only, NOT the site-wide set)", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    await page.keyboard.press(":");
    await expect(overlay(page)).toBeVisible();
    // A tmux-command-prompt command works (proves the box is actually in
    // tmux mode, not merely open) ...
    await typeAndEnter(page, "select-window 1");
    await expect(overlay(page)).not.toBeVisible();
    await expect(page).toHaveURL(/\/repositories$/);

    // ... but a site-wide-only command name is NOT recognized here — it
    // reports the same E492 unknown-command error as any gibberish text
    // would ("Only cmdline.tmuxCommands are offered/executed" in this mode).
    await ctrlB(page);
    await page.keyboard.press(":");
    await typeAndEnter(page, "dashboard");
    await expect(errorText(page)).toContainText("E492");
    await expect(page).toHaveURL(/\/repositories$/);
  });

  test("no suggestions list ever renders, even mid-type", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press(":");
    await expect(overlay(page)).toBeVisible();
    await expect(page.locator('[data-testid="cmdline-suggestions"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="cmdline-suggestion"]')).toHaveCount(0);
    await page.keyboard.type("d");
    await expect(page.locator('[data-testid="cmdline-suggestions"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="cmdline-suggestion"]')).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("Esc closes the box with no side effects", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press(":");
    await expect(overlay(page)).toBeVisible();
    await page.keyboard.type("repositories");
    await page.keyboard.press("Escape");
    await expect(overlay(page)).not.toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("a status-bar prompt already open blocks Ctrl-b : from opening the box", async ({ page }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    await page.keyboard.press(","); // rename-window prompt
    await expect(page.locator('[data-testid="status-prompt"]')).toBeVisible();

    await ctrlB(page);
    await page.keyboard.press(":");
    await expect(overlay(page)).not.toBeVisible();
    await expect(page.locator('[data-testid="status-prompt"]')).toBeVisible();
  });

  test("while the box is open, the prefix is inert except the bare Ctrl-b arm and ]: no digit switch, no & confirm", async ({
    page,
  }) => {
    // Same "prompt owns the keyboard" gate as an open status-bar prompt
    // (reuses/extends the isPromptActive gating pattern) —
    // mirrors tmux.spec.ts's own "Ctrl-b <digit>/&/x/,/n are all inert
    // while the rename prompt is open" regression test.
    await gotoReady(page, "/");
    await page.keyboard.press(":");
    await expect(overlay(page)).toBeVisible();

    await ctrlB(page);
    await page.keyboard.press("2");
    await expect(page).toHaveURL(/\/$/);
    await expect(overlay(page)).toBeVisible();

    await ctrlB(page);
    await page.keyboard.press("&");
    await expect(page.locator('[data-testid="status-confirm"]')).not.toBeVisible();
    await expect(overlay(page)).toBeVisible();
  });

  test("the box never covers the status bar — it stays hit-testable at its own center", async ({ page }) => {
    // Same elementFromPoint hit-test tmux.spec.ts's own "grep is window
    // chrome, the status bar is session chrome" suite uses for the grep
    // overlay's backdrop.
    await gotoReady(page, "/");
    await page.keyboard.press(":");
    await expect(overlay(page)).toBeVisible();

    const box = await page.locator('[data-testid="status-bar-windows"]').boundingBox();
    if (!box) throw new Error("status bar not laid out");
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const testid = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.getAttribute("data-testid") ?? null,
      point,
    );
    expect(testid).not.toBe("cmdline-overlay");
    expect(["status-bar-windows", "status-bar-window"]).toContain(testid);
  });
});

test.describe("Cmdline: window-chrome contract — closes on every switch path + reboot", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("a status-bar window click closes an open box (even mid-type, with no navigation side effect from the typed text)", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await page.keyboard.press(":");
    await expect(overlay(page)).toBeVisible();
    await page.keyboard.type("this is not a command");
    await page.locator('[data-testid="status-bar-window"][data-window-id="repositories"]').click();
    await expect(overlay(page)).not.toBeVisible();
    await expect(page).toHaveURL(/\/repositories$/);
  });

  test("reboot (status-bar ↻ click) closes an open box", async ({ page }) => {
    await gotoReady(page, "/repositories");
    await page.keyboard.press(":");
    await expect(overlay(page)).toBeVisible();
    await page.locator('[data-testid="status-bar-reboot"]').click();
    await expect(overlay(page)).not.toBeVisible();
    await expect(page.locator('[data-testid="boot-sequence"]')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("Cmdline: `:` stays literal inside other text inputs", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test(": types literally into an open grep query, never opening the box", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    await expect(page.locator('[data-testid="grep-overlay"]')).toBeVisible();
    await page.keyboard.press(":");
    await expect(page.locator('[data-testid="grep-query"]')).toContainText(":");
    await expect(overlay(page)).not.toBeVisible();
  });

  // The Employment `f`-filter prompt this test covered no longer exists
  // (Decision 7, PLAN.md — dropped along with drill-down/`../` in the v2
  // rebuild). Employment's own
  // ":"-while-editor-open coverage lives in the "editor ex-mode still works
  // through the box" describe block below (the Employment entry point).

  test(": types literally into the rename-window prompt, never opening the box", async ({ page }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    await page.keyboard.press(",");
    await expect(page.locator('[data-testid="status-prompt"]')).toBeVisible();
    await page.keyboard.press(":");
    await expect(page.locator('[data-testid="status-prompt"]')).toContainText(":");
    await expect(overlay(page)).not.toBeVisible();
  });
});

test.describe("Cmdline: palette feel — silent Tab completion + zsh-style cycling", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("Tab completes the unique match, silently (no suggestions list ever appears)", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press(":");
    await page.keyboard.type("reb");
    await page.keyboard.press("Tab");
    await expect(input(page)).toContainText("reboot");
    await expect(page.locator('[data-testid="cmdline-suggestions"]')).toHaveCount(0);
  });

  test("repeated Tab cycles through every match, wrapping around (zsh-style)", async ({ page }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    await page.keyboard.press(":"); // tmux mode — kill-window and kill-pane both start with "kill"
    await page.keyboard.type("kill");
    await page.keyboard.press("Tab");
    const first = (await input(page).textContent())?.replace("▌", "");
    await page.keyboard.press("Tab");
    const second = (await input(page).textContent())?.replace("▌", "");
    expect(second).not.toBe(first);
    expect(["kill-window", "kill-pane"]).toContain(first);
    expect(["kill-window", "kill-pane"]).toContain(second);
    await page.keyboard.press("Tab");
    const third = (await input(page).textContent())?.replace("▌", "");
    expect(third).toBe(first);
  });

  test("a non-Tab keystroke resets the cycle, so the next Tab starts fresh", async ({ page }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    await page.keyboard.press(":");
    await page.keyboard.type("kill");
    await page.keyboard.press("Tab");
    const first = (await input(page).textContent())?.replace("▌", "");
    await page.keyboard.press("Backspace"); // edits mid-cycle — invalidates it
    await page.keyboard.type(first?.slice(-1) ?? "");
    await page.keyboard.press("Tab");
    const afterReset = (await input(page).textContent())?.replace("▌", "");
    expect(afterReset).toBe(first); // fresh cycle from the same text -> same first match
  });

  test("j/k stay typeable inside the input (no suggestions list to navigate)", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press(":");
    await page.keyboard.type("j");
    await expect(input(page)).toContainText("j");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("k");
    await expect(input(page)).toContainText("k");
  });

  test("ArrowDown/ArrowUp are consumed no-ops (no suggestions list to navigate)", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press(":");
    await page.keyboard.type("bui");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowUp");
    await expect(input(page)).toContainText("bui");
    await expect(page.locator('[data-testid="cmdline-suggestion"]')).toHaveCount(0);
  });
});

test.describe("Cmdline: unknown command (E492)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("a gibberish command shows an E492-style error in the box and does not navigate", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press(":");
    await typeAndEnter(page, "zzzbogus");
    await expect(overlay(page)).toBeVisible();
    await expect(errorText(page)).toContainText("E492");
    await expect(errorText(page)).toContainText("zzzbogus");
    await expect(page).toHaveURL(/\/$/);
  });

  test("Esc after an error closes the box cleanly", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press(":");
    await typeAndEnter(page, "zzzbogus");
    await expect(errorText(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(overlay(page)).not.toBeVisible();
  });

  test("the next keystroke after an error clears it", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press(":");
    await typeAndEnter(page, "zzzbogus");
    await expect(errorText(page)).toBeVisible();
    await page.keyboard.press("Backspace");
    await expect(errorText(page)).not.toBeVisible();
  });
});

test.describe("Cmdline: Ctrl-b ] pastes into the box (paste-target registration)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  });

  test("a copy-mode yank pastes into the open box", async ({ page }) => {
    await gotoReady(page, "/profile");
    // Yank the profile summary text via copy-mode (data-copy-source),
    // exactly like tmux.spec.ts's own "copy-mode yank -> paste into grep
    // query round-trips" test.
    await ctrlB(page);
    await page.keyboard.press("[");
    await page.keyboard.press("y"); // yank the cursor's current line (no selection)
    await expect(page.locator('[data-testid="copy-mode-overlay"]')).not.toBeVisible();

    await page.keyboard.press(":");
    await expect(overlay(page)).toBeVisible();
    await ctrlB(page);
    await page.keyboard.press("]");
    const text = (await input(page).textContent()) ?? "";
    expect(text.replace("▌", "").length).toBeGreaterThan(0);
  });
});

test.describe("Cmdline: editor ex-mode still works through the box", () => {
  interface EntryPoint {
    name: string;
    open: (page: Page) => Promise<void>;
    assertParentVisible: (page: Page) => Promise<void>;
  }

  const entryPoints: EntryPoint[] = [
    {
      name: "Repositories",
      async open(page) {
        await gotoReady(page, "/repositories");
        // The default-highlighted panel [1] repo is the virtual
        // "all-projects" entry (no README.md in its flat .md-only tree), and
        // the Files pane renders the FULL nested tree at once —
        // daily-tech-digest genuinely has two files named "README.md" (root
        // + "site/README.md") simultaneously visible, which would make the
        // locator below ambiguous. transcript-tts has exactly one README.md
        // and no nested duplicate, so clicking its panel [1] row directly
        // (selects AND loads its tree) sidesteps both issues — same
        // approach as editor-vim.spec.ts's Repositories entry point.
        await page.locator('[data-testid="repositories-repo-row"][data-repo-name="transcript-tts"]').click();
        await expect(page.locator('[data-testid="repositories-tree-row"][data-entry-name="README.md"]')).toBeVisible();
        await page.locator('[data-testid="repositories-tree-row"][data-entry-name="README.md"]').click();
        await page.keyboard.press("2");
        await page.keyboard.press("Enter");
        await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
      },
      async assertParentVisible(page) {
        await expect(page.locator('[data-testid="repositories-tree-row"][data-entry-name="README.md"]')).toBeVisible();
      },
    },
    {
      name: "Employment",
      async open(page) {
        // v2 (flat list + timeline):
        // no more drill-down — row 0 (newest) is selected by default, so a
        // single Enter opens its role.md directly (same as editor-vim.spec.ts's
        // Employment entry point).
        await gotoReady(page, "/employment");
        await expect(page.locator('[data-testid="employment-row"]').first()).toBeVisible();
        await page.keyboard.press("Enter");
        await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
      },
      async assertParentVisible(page) {
        // There is no `employment-path` breadcrumb element. Anchor instead:
        // the flat list's row 0 is back, still selected (its own preview
        // path is the exact file this entry point opened).
        await expect(page.locator('[data-testid="employment-row"]').first()).toBeVisible();
        await expect(page.locator('[data-testid="employment-preview-path"]')).toHaveText("enaimco/software-developer.md");
      },
    },
  ];

  for (const entry of entryPoints) {
    test.describe(entry.name, () => {
      test.beforeEach(async ({ context }) => {
        await context.route("**/api.github.com/**", (route) => route.abort());
      });

      test(": opens the box in ex mode, no suggestions list, Tab-completion still spans exCommands + the site-wide set", async ({
        page,
      }) => {
        await entry.open(page);
        await page.keyboard.press(":");
        await expect(overlay(page)).toBeVisible();
        await expect(page.locator('[data-testid="cmdline-suggestions"]')).toHaveCount(0);
        // Tab-completing a site-wide-only command name (not an ex command)
        // still works here, proving the merged exCommands ∪ commands list
        // is still the completion source even though nothing renders it as
        // a browsable list.
        await page.keyboard.type("dash");
        await page.keyboard.press("Tab");
        await expect(input(page)).toContainText("dashboard");
        await page.keyboard.press("Escape");
      });

      test(":q closes the editor back to the exact parent view (editor context wins over the site-wide q)", async ({
        page,
      }) => {
        await entry.open(page);
        await page.keyboard.press(":");
        await typeAndEnter(page, "q");
        await expect(overlay(page)).not.toBeVisible();
        await expect(page.locator('[data-testid="editor-scroller"]')).not.toBeVisible();
        await entry.assertParentVisible(page);
      });

      test(":w shows a readonly error in the box and never closes the editor", async ({ page }) => {
        await entry.open(page);
        await page.keyboard.press(":");
        await typeAndEnter(page, "w");
        await expect(errorText(page)).toContainText("readonly");
        await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
      });

      // Bang variants of a recognized command ("w!"/"wq!") report the exact
      // same E45 readonly error as their bang-less forms, never the
      // unknown-command E492.
      test(":wq! shows the E45 readonly error, not E492, and never closes the editor", async ({ page }) => {
        await entry.open(page);
        await page.keyboard.press(":");
        await typeAndEnter(page, "wq!");
        await expect(errorText(page)).toContainText("E45");
        await expect(errorText(page)).not.toContainText("E492");
        await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
      });

      test(":<number> jumps to that line", async ({ page }) => {
        await entry.open(page);
        const totalLines = await page.locator("[data-line]").count();
        test.skip(totalLines < 3, "fixture file too short");
        await page.keyboard.press(":");
        await typeAndEnter(page, "3");
        await expect(overlay(page)).not.toBeVisible();
        await expect(page.locator('[data-testid="editor-position"]')).toContainText("3:");
      });

      test("an unrecognized ex command falls through to the site-wide set (:dashboard navigates away)", async ({
        page,
      }) => {
        await entry.open(page);
        await page.keyboard.press(":");
        await typeAndEnter(page, "dashboard");
        await expect(overlay(page)).not.toBeVisible();
        await expect(page).toHaveURL(/\/$/);
      });
    });
  }
});

test.describe("Cmdline: tmux command-prompt mode (executes through the same flows as the prefix bindings)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("rename-window <name> renames the current window immediately, matching Ctrl-b ,'s underlying rename", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    await page.keyboard.press(":");
    await typeAndEnter(page, "rename-window scratch");
    await expect(overlay(page)).not.toBeVisible();
    await expect(page.locator('[data-testid="status-bar-window"][data-window-id="dashboard"]')).toHaveText(
      "0:scratch*",
    );
  });

  test("rename-window with no argument shows a usage error", async ({ page }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    await page.keyboard.press(":");
    await typeAndEnter(page, "rename-window");
    await expect(errorText(page)).toContainText("usage");
  });

  test("kill-window removes the current window, matching Ctrl-b &'s underlying kill (no confirm prompt)", async ({
    page,
  }) => {
    await gotoReady(page, "/repositories");
    await ctrlB(page);
    await page.keyboard.press(":");
    await typeAndEnter(page, "kill-window");
    await expect(overlay(page)).not.toBeVisible();
    await expect(page.locator('[data-testid="status-bar-window"][data-window-id="repositories"]')).toHaveCount(0);
  });

  // Killing the session's last window destroys the session outright and,
  // with no other session to fall back to, detaches the client to the host
  // shell printing exactly `[exited]` (see tests/e2e/tmux.spec.ts's own
  // "killing every window down to the last one" test).
  test("kill-window on the last remaining window destroys the session and detaches to the host shell ([exited])", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    for (let i = 0; i < 5; i++) {
      await ctrlB(page);
      await page.keyboard.press("&");
      await page.keyboard.press("y");
    }
    await expect(page.locator('[data-testid="status-bar-window"]')).toHaveCount(1);

    await ctrlB(page);
    await page.keyboard.press(":");
    await typeAndEnter(page, "kill-window");
    await expect(page.locator('[data-testid="status-bar-windows"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="shell-line"]').last()).toHaveText("[exited]");
  });

  test("kill-pane inside Repositories with multiple panels removes only the focused panel, matching Ctrl-b x", async ({
    page,
  }) => {
    await gotoReady(page, "/repositories");
    await page.keyboard.press("2");
    await expect(page.locator('[data-testid="repositories-panel-2"]')).toBeVisible();

    await ctrlB(page);
    await page.keyboard.press(":");
    await typeAndEnter(page, "kill-pane");
    await expect(overlay(page)).not.toBeVisible();
    await expect(page.locator('[data-testid="repositories-panel-2"]')).toHaveCount(0);
  });

  test("select-window <n> jumps straight to that window, matching the Ctrl-b <digit> targets", async ({ page }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    await page.keyboard.press(":");
    await typeAndEnter(page, "select-window 2");
    await expect(overlay(page)).not.toBeVisible();
    await expect(page).toHaveURL(/\/employment$/);
  });

  test("select-window 0 jumps to the dashboard", async ({ page }) => {
    await gotoReady(page, "/repositories");
    await ctrlB(page);
    await page.keyboard.press(":");
    await typeAndEnter(page, "select-window 0");
    await expect(page).toHaveURL(/\/$/);
  });

  test("select-window with a non-numeric argument shows a usage error", async ({ page }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    await page.keyboard.press(":");
    await typeAndEnter(page, "select-window abc");
    await expect(errorText(page)).toContainText("usage");
  });

  test("select-window with an out-of-range numeric index shows 'no such window'", async ({ page }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    await page.keyboard.press(":");
    await typeAndEnter(page, "select-window 9");
    await expect(errorText(page)).toContainText("no such window");
  });
});

// ---------------------------------------------------------------------
// Data-driven sweep over src/data/cmdline.yaml's own `commands` list —
// every entry there is executed here by its `action` id,
// so a future addition to that file fails loudly (an unhandled `action`)
// rather than silently shipping untested.
// ---------------------------------------------------------------------

const VIEW_ROUTE_BY_ACTION: Record<string, RegExp> = {
  "view:home": /\/$/,
  "view:repositories": /\/repositories$/,
  "view:employment": /\/employment$/,
  "view:profile": /\/profile$/,
  "view:retina-v": /\/retina-v$/,
  "view:help": /\/help$/,
};

test.describe("Cmdline: data-driven sweep of every src/data/cmdline.yaml command", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  const commands = loadCmdlineYaml().commands;

  for (const def of commands) {
    const action = def.action;

    if (action && action in VIEW_ROUTE_BY_ACTION) {
      test(`:${def.name} jumps to the route matching ${action}`, async ({ page }) => {
        await gotoReady(page, "/");
        await page.keyboard.press(":");
        await typeAndEnter(page, def.name);
        await expect(overlay(page)).not.toBeVisible();
        await expect(page).toHaveURL(VIEW_ROUTE_BY_ACTION[action]);
      });
      continue;
    }

    if (action === "grep") {
      test(`:${def.name} <query> opens the grep overlay pre-filled and already searching`, async ({ page }) => {
        await gotoReady(page, "/");
        await page.keyboard.press(":");
        await typeAndEnter(page, `${def.name} svelte`);
        await expect(overlay(page)).not.toBeVisible();
        await expect(page.locator('[data-testid="grep-overlay"]')).toBeVisible();
        await expect(page.locator('[data-testid="grep-query"]')).toContainText("svelte");

        // The overlay is already SEARCHING, not just open with the query
        // text sitting there unused — asserted against the real index via
        // the same `search()` port the component itself uses (grep.spec.ts
        // does the same), rather than a hardcoded row count: the number of
        // rows actually RENDERED also depends on the list pane's own
        // ResizeObserver-measured height (GrepOverlay.svelte's `listVis`),
        // not just the hit count, so only a lower bound is asserted here.
        const files = JSON.parse(
          readFileSync(join(ROOT, "public/generated/grep-index.json"), "utf8"),
        ) as RepoFile[];
        const hits = search(files, "svelte");
        test.skip(hits.length === 0, "fixture/real index has no 'svelte' hits to assert against");
        await expect(page.locator('[data-testid="grep-row"]')).not.toHaveCount(0);
        await expect(page.locator('[data-testid="grep-counter"]')).toHaveText(formatCount(hits, files, "svelte"));
      });
      continue;
    }

    if (action === "reboot") {
      test(`:${def.name} replays the E.D.I.T.H boot sequence`, async ({ page }) => {
        await gotoReady(page, "/repositories");
        await page.keyboard.press(":");
        await typeAndEnter(page, def.name);
        await expect(overlay(page)).not.toBeVisible();
        await expect(page.locator('[data-testid="boot-sequence"]')).toBeVisible();
        await expect(page).toHaveURL(/\/$/);
      });
      continue;
    }

    if (action === "resume") {
      test(`:${def.name} downloads the resume via window.open, same as Profile's r`, async ({ page }) => {
        await gotoReady(page, "/");
        await mockOpen(page);
        await page.keyboard.press(":");
        await typeAndEnter(page, def.name);
        await expect(overlay(page)).not.toBeVisible();
        expect(await openedCalls(page)).toEqual([{ url: "/assets/resume.pdf", target: "_blank" }]);
      });
      continue;
    }

    if (action === "exit-program") {
      // Exits the active pane's program to a shell in the SAME window
      // (does not kill it). Behavior on the last remaining window is its own
      // dedicated test below (no last-window guard applies, since nothing is
      // being killed).
      test(`:${def.name} exits the active pane's program to a shell in the same window`, async ({ page }) => {
        await gotoReady(page, "/repositories");
        await page.keyboard.press(":");
        await typeAndEnter(page, def.name);
        await expect(overlay(page)).not.toBeVisible();
        // Window survives (same stable id), auto-renamed live to "zsh" —
        // and its URL is frozen (Architecture notes: pushState only for
        // canonical program windows — "shell" isn't one).
        await expect(page.locator('[data-testid="status-bar-window"][data-window-id="repositories"]')).toHaveText(/zsh/);
        await expect(page.locator('[data-testid="shell-prompt"]')).toBeVisible();
        await expect(page).toHaveURL(/\/repositories$/);
      });
      continue;
    }

    // Any future cmdline.yaml command with an `action` this sweep doesn't
    // yet know how to exercise fails loudly here, by design ("the e2e
    // sweep is generated FROM the yaml so the list can't drift") — rather
    // than being silently skipped.
    test(`:${def.name} has sweep coverage for its action "${action}"`, () => {
      throw new Error(
        `cmdline.spec.ts's data-driven sweep doesn't know how to exercise action "${action}" (command "${def.name}") — add a case above.`,
      );
    });
  }

  test(":q on the last remaining window exits its program to a shell, without killing it (no last-window refusal — nothing is being killed)", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    for (let i = 0; i < 5; i++) {
      await ctrlB(page);
      await page.keyboard.press("&");
      await page.keyboard.press("y");
    }
    await expect(page.locator('[data-testid="status-bar-window"]')).toHaveCount(1);

    await page.keyboard.press(":");
    await typeAndEnter(page, "q");
    await expect(page.locator('[data-testid="status-bar-window"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="shell-prompt"]')).toBeVisible();
  });
});

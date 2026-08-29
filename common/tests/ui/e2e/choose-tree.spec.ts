// Behavioral e2e suite for the choose-tree overlay (`Ctrl-b w`). Companion
// to tests/e2e/panes.spec.ts (splits/nav/kill/layouts) and
// tests/e2e/sessions.spec.ts (the session model itself, whose
// `tmux new -s <name>` this file reuses to get a second session to browse).
import { expect, test, type Page } from "../support/fixtures";

async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

async function ctrlB(page: Page) {
  await page.keyboard.down("Control");
  await page.keyboard.press("b");
  await page.keyboard.up("Control");
}

async function prefixed(page: Page, key: string) {
  await ctrlB(page);
  await page.keyboard.press(key);
}

async function openChooseTree(page: Page) {
  await prefixed(page, "w");
}

async function detach(page: Page) {
  await prefixed(page, "d");
  // Waits for the host shell to actually mount before the caller types into
  // it — Employment/Repositories's own teardown effects can otherwise leave a
  // narrow window where the very first keystrokes race the PaneTree ->
  // host-Shell swap.
  await page.locator('[data-shell-mode="host"]').waitFor({ state: "visible" });
}

async function runInShell(page: Page, line: string) {
  await page.keyboard.type(line);
  await page.keyboard.press("Enter");
}

const overlay = (page: Page) => page.locator('[data-testid="choose-tree-overlay"]');
const sessionRows = (page: Page) => page.locator('[data-testid="choose-tree-session-row"]');
const windowRows = (page: Page) => page.locator('[data-testid="choose-tree-window-row"]');
const selectedRow = (page: Page) => page.locator('[data-selected="true"]');
const killConfirm = (page: Page) => page.locator('[data-testid="choose-tree-kill-confirm"]');
const statusBarWindows = (page: Page) => page.locator('[data-testid="status-bar-windows"]');
const sessionLabel = (page: Page) => page.locator('[data-testid="status-bar-session"]');

test.describe("choose-tree opening / initial state (real tmux fidelity)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("Ctrl-b w opens a full window-content overlay; the status bar stays visible", async ({ page }) => {
    await gotoReady(page, "/repositories");
    await openChooseTree(page);
    await expect(overlay(page)).toBeVisible();
    await expect(statusBarWindows(page)).toBeVisible();
  });

  test("the current session starts expanded (6 window rows visible) and the current window is initially selected", async ({
    page,
  }) => {
    await gotoReady(page, "/repositories");
    await openChooseTree(page);
    await expect(sessionRows(page)).toHaveCount(1);
    await expect(windowRows(page)).toHaveCount(6);
    await expect(selectedRow(page)).toHaveAttribute("data-window-id", "repositories");
  });

  test("session row text: {name}: {n} windows, (attached)", async ({ page }) => {
    await gotoReady(page, "/");
    await openChooseTree(page);
    await expect(sessionRows(page).first()).toContainText("10.42.7.13: 6 windows, (attached)");
  });

  test("window row text and flags: {index}: {name} with * on the active window", async ({ page }) => {
    await gotoReady(page, "/repositories");
    await openChooseTree(page);
    await expect(windowRows(page).filter({ hasText: "1: repos*" })).toHaveCount(1);
    await expect(windowRows(page).filter({ hasText: "0: dashboard" })).toHaveCount(1);
  });

  test("the bottom preview strip describes the selected window's pane programs + layout", async ({ page }) => {
    await gotoReady(page, "/repositories");
    await openChooseTree(page);
    await expect(page.locator('[data-testid="choose-tree-preview"]')).toContainText("repositories");
  });
});

test.describe("choose-tree navigation (arrows/h/l)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("ArrowDown/ArrowUp move the selection across visible rows", async ({ page }) => {
    await gotoReady(page, "/");
    await openChooseTree(page);
    await expect(selectedRow(page)).toHaveAttribute("data-window-id", "dashboard");
    await page.keyboard.press("ArrowDown");
    await expect(selectedRow(page)).toHaveAttribute("data-window-id", "repositories");
    await page.keyboard.press("ArrowDown");
    await expect(selectedRow(page)).toHaveAttribute("data-window-id", "employment");
    await page.keyboard.press("ArrowUp");
    await expect(selectedRow(page)).toHaveAttribute("data-window-id", "repositories");
  });

  test("h on a window row jumps to its parent session row; h again collapses it", async ({ page }) => {
    await gotoReady(page, "/repositories");
    await openChooseTree(page);
    await expect(windowRows(page)).toHaveCount(6);
    await page.keyboard.press("h");
    await expect(selectedRow(page)).toHaveAttribute("data-session-id", /.+/);
    await expect(selectedRow(page)).toHaveAttribute("data-window-id", "");
    await page.keyboard.press("h");
    await expect(windowRows(page)).toHaveCount(0);
    await expect(sessionRows(page)).toHaveCount(1);
  });

  test("l re-expands a collapsed session", async ({ page }) => {
    await gotoReady(page, "/");
    await openChooseTree(page);
    await page.keyboard.press("h"); // window row -> jump to its parent session row
    await page.keyboard.press("h"); // session row (already selected) -> collapse it
    await expect(windowRows(page)).toHaveCount(0);
    await page.keyboard.press("l"); // re-expand
    await expect(windowRows(page)).toHaveCount(6);
  });
});

test.describe("choose-tree Enter switches window/session; x kills; q/Esc close", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("Enter on a window row switches to it and closes the overlay", async ({ page }) => {
    await gotoReady(page, "/");
    await openChooseTree(page);
    await page.keyboard.press("ArrowDown"); // repositories
    await page.keyboard.press("Enter");
    await expect(overlay(page)).not.toBeVisible();
    await expect(page).toHaveURL(/\/repositories$/);
  });

  test("q closes with no side effect; Esc closes with no side effect", async ({ page }) => {
    await gotoReady(page, "/");
    await openChooseTree(page);
    await page.keyboard.press("q");
    await expect(overlay(page)).not.toBeVisible();
    await expect(page).toHaveURL(/\/$/);

    await openChooseTree(page);
    await page.keyboard.press("Escape");
    await expect(overlay(page)).not.toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("x prompts an in-overlay Kill window {i}? (y/n); case-insensitive Y confirms; overlay stays open", async ({
    page,
  }) => {
    await gotoReady(page, "/repositories");
    await openChooseTree(page);
    await page.keyboard.press("ArrowDown"); // employment row (index 2)
    await page.keyboard.press("x");
    await expect(killConfirm(page)).toHaveText("Kill window 2? (y/n)");
    await page.keyboard.press("Y"); // case-insensitive — the real tmux quirk
    await expect(killConfirm(page)).not.toBeVisible();
    await expect(overlay(page)).toBeVisible(); // stays open after a kill
    await expect(windowRows(page)).toHaveCount(5);
    await expect(windowRows(page).filter({ hasText: "employment" })).toHaveCount(0);
  });

  test("any OTHER key cancels just the kill sub-prompt, leaving the overlay open", async ({ page }) => {
    await gotoReady(page, "/repositories");
    await openChooseTree(page);
    await page.keyboard.press("x");
    await expect(killConfirm(page)).toBeVisible();
    await page.keyboard.press("z");
    await expect(killConfirm(page)).not.toBeVisible();
    await expect(overlay(page)).toBeVisible();
    await expect(windowRows(page)).toHaveCount(6); // nothing killed
  });

  test("killing every window down to the last one still cascades to [exited], same as Ctrl-b &", async ({ page }) => {
    await gotoReady(page, "/");
    await openChooseTree(page);
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("x");
      await page.keyboard.press("y");
    }
    await expect(windowRows(page)).toHaveCount(1);
    await page.keyboard.press("x");
    await page.keyboard.press("y");
    await expect(overlay(page)).not.toBeVisible();
    await expect(page.locator('[data-shell-mode="host"]')).toBeVisible();
    await expect(page.locator('[data-testid="shell-line"]').last()).toHaveText("[exited]");
  });
});

test.describe("choose-tree does NOT open competing modals while open (window-chrome contract)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  // Prefix precedence over grep: the tmux prefix (and therefore choose-tree,
  // opened via it) still works even while grep is open — closing it, exactly
  // like every other window-switch prefix key already does
  // (`closeWindowChrome()`). Cmdline is a DIFFERENT case: opening it already
  // blocks every OTHER prefixed key including plain digit targets (the
  // prefix system treats it like the status prompts), so `Ctrl-b w` is
  // correctly inert while Cmdline is open too, same as `Ctrl-b 2` — there's
  // nothing to "close on open" in that direction since choose-tree never
  // gets the chance to open in the first place.
  test("opening choose-tree closes an already-open grep overlay", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    await expect(page.locator('[data-testid="grep-overlay"]')).toBeVisible();
    await openChooseTree(page);
    await expect(page.locator('[data-testid="grep-overlay"]')).not.toBeVisible();
    await expect(overlay(page)).toBeVisible();
  });

  test("? does not open the help palette while choose-tree is open", async ({ page }) => {
    await gotoReady(page, "/");
    await openChooseTree(page);
    await page.keyboard.press("?");
    await expect(page.locator('[data-testid="help-search-overlay"]')).not.toBeVisible();
    await expect(overlay(page)).toBeVisible();
  });

  test("/ does not open grep while choose-tree is open (bare / is swallowed as an unrecognized key)", async ({ page }) => {
    await gotoReady(page, "/");
    await openChooseTree(page);
    await page.keyboard.press("/");
    await expect(page.locator('[data-testid="grep-overlay"]')).not.toBeVisible();
    await expect(overlay(page)).toBeVisible();
  });

  test("Ctrl-b , / & / x-prefixed / : are all inert while choose-tree is open (would starve a prompt underneath it)", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await openChooseTree(page);

    await prefixed(page, ",");
    await expect(page.locator('[data-testid="status-prompt"]')).not.toBeVisible();
    await expect(overlay(page)).toBeVisible();

    await prefixed(page, "&");
    await expect(page.locator('[data-testid="status-confirm"]')).not.toBeVisible();
    await expect(overlay(page)).toBeVisible();

    await prefixed(page, ":");
    await expect(page.locator('[data-testid="cmdline-overlay"]')).not.toBeVisible();
    await expect(overlay(page)).toBeVisible();
  });

  test("Ctrl-b <digit>/n switch windows AND close the overlay for free", async ({ page }) => {
    await gotoReady(page, "/");
    await openChooseTree(page);
    await prefixed(page, "2");
    await expect(overlay(page)).not.toBeVisible();
    await expect(page).toHaveURL(/\/employment$/);
  });

  test("Ctrl-b d still detaches from within an open choose-tree, closing it", async ({ page }) => {
    await gotoReady(page, "/");
    await openChooseTree(page);
    await detach(page);
    await expect(overlay(page)).not.toBeVisible();
    await expect(page.locator('[data-shell-mode="host"]')).toBeVisible();
  });
});

test.describe("choose-tree across sessions (create a second session via the host shell)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  /** `tmux new -s test` (host mode) creates AND attaches "test" — real tmux's
   * own "starting a new session from outside both creates and attaches".
   * `createSession` APPENDS to `client.sessions` (src/lib/tmux.ts), so the
   * default session "10.42.7.13" stays FIRST in array order (and therefore
   * FIRST in choose-tree's own row list — sessions are rendered in that
   * same array order) even though "test" is now the ATTACHED one. */
  async function createAndAttachSecondSession(page: Page) {
    await detach(page);
    await runInShell(page, "tmux new -s test");
    await expect(sessionLabel(page)).toHaveText("Session: test");
  }

  test("a second session appears collapsed; expanding it and pressing Enter on its window switches the attached session", async ({
    page,
  }) => {
    await gotoReady(page, "/repositories");
    await createAndAttachSecondSession(page);

    await openChooseTree(page);
    await expect(sessionRows(page)).toHaveCount(2);
    // "test" (attached, current) starts expanded; "10.42.7.13" collapsed.
    await expect(windowRows(page)).toHaveCount(1); // just test's own 0:zsh

    const otherSessionRow = sessionRows(page).filter({ hasText: "10.42.7.13" });
    await expect(otherSessionRow).toContainText("10.42.7.13: 6 windows");
    await expect(otherSessionRow).not.toContainText("(attached)");

    // Select the other session's row directly (array order puts it FIRST,
    // ahead of "test" — see createAndAttachSecondSession's own comment) and
    // expand it.
    await otherSessionRow.click();
    await page.keyboard.press("l");
    await expect(windowRows(page)).toHaveCount(7); // test's 1 + the other session's 6

    // Move onto its "repositories" window row and switch to it.
    const reposRow = windowRows(page).filter({ hasText: "1: repos" });
    await expect(reposRow).toBeVisible();
    await reposRow.click();
    await page.keyboard.press("Enter");

    await expect(overlay(page)).not.toBeVisible();
    await expect(sessionLabel(page)).toHaveText("Session: 10.42.7.13");
    await expect(page).toHaveURL(/\/repositories$/);
  });

  test("Enter on a SESSION row (not a window row) attaches it without changing its active window", async ({ page }) => {
    await gotoReady(page, "/employment");
    await createAndAttachSecondSession(page);
    await openChooseTree(page);

    const otherSessionRow = sessionRows(page).filter({ hasText: "10.42.7.13" });
    await otherSessionRow.click();
    await page.keyboard.press("Enter");

    await expect(overlay(page)).not.toBeVisible();
    await expect(sessionLabel(page)).toHaveText("Session: 10.42.7.13");
    // Stayed on whichever window that session already had active (employment).
    await expect(page).toHaveURL(/\/employment$/);
  });

  test("x on a session row prompts Kill session {name}? (y/n); y kills every window in it", async ({ page }) => {
    await gotoReady(page, "/");
    await createAndAttachSecondSession(page);
    await openChooseTree(page);

    const otherSessionRow = sessionRows(page).filter({ hasText: "10.42.7.13" });
    await otherSessionRow.click();
    await page.keyboard.press("x");
    await expect(killConfirm(page)).toHaveText("Kill session 10.42.7.13? (y/n)");
    await page.keyboard.press("y");
    await expect(killConfirm(page)).not.toBeVisible();
    await expect(sessionRows(page)).toHaveCount(1);
    await expect(sessionRows(page)).toContainText("test");
  });
});

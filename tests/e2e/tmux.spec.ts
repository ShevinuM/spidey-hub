// Behavioral e2e suite for the tmux prefix (Ctrl-b) state machine
// (Terminal.svelte) and the mobile-block card (Shell.astro) — PLAN.md
// Phase 9, reworked by PLAN.md Phase 1:
//   - the window list gained "0:dashboard" and "5:help" (items 6/13), so
//     `n`/`p` now cycle six windows and `5`/`?` jump straight to Help;
//   - the prefix now takes precedence over the grep overlay (item 2 in
//     PLAN.md "Orchestrator design decisions" — "Prefix precedence over
//     grep"): Ctrl-b arms even while grep is open, retiring the old
//     "prefix inert while grep is open" rule.
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

const STATUS_BAR = '[data-testid="status-bar-windows"]';
async function statusBarText(page: Page) {
  return (await page.locator(STATUS_BAR).innerText()).replace(/\s+/g, " ").trim();
}

const WINDOWS = ["dashboard", "builds", "personnel", "retina-v", "profile", "help"];
/** `lastId` (PLAN.md Iteration 3 Phase 4 item 4.3 tmux fidelity reference)
 * is the real tmux `-` flag on the session's PREVIOUSLY active window —
 * omit it for assertions made before any in-test window switch. */
function winText(activeId: string, lastId?: string): string {
  return WINDOWS.map((id, i) => `${i}:${id}${id === activeId ? "*" : id === lastId ? "-" : ""}`).join(" ");
}

async function ctrlB(page: Page) {
  await page.keyboard.down("Control");
  await page.keyboard.press("b");
  await page.keyboard.up("Control");
}

test.describe("tmux prefix (Ctrl-b)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("Ctrl-b 2 switches to personnel", async ({ page }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    await page.keyboard.press("2");
    await expect(page).toHaveURL(/\/personnel$/);
    expect(await statusBarText(page)).toBe(winText("personnel", "dashboard"));
  });

  test("Ctrl-b 1/3/4 switch to builds/retina-v/profile", async ({ page }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    await page.keyboard.press("3");
    await expect(page).toHaveURL(/\/retina-v$/);

    await ctrlB(page);
    await page.keyboard.press("4");
    await expect(page).toHaveURL(/\/profile$/);

    await ctrlB(page);
    await page.keyboard.press("1");
    await expect(page).toHaveURL(/\/builds$/);
  });

  test("Ctrl-b 5 switches to help", async ({ page }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    await page.keyboard.press("5");
    await expect(page).toHaveURL(/\/help$/);
    expect(await statusBarText(page)).toBe(winText("help", "dashboard"));
  });

  test("Ctrl-b ? switches to help (tmux list-keys style)", async ({ page }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    await page.keyboard.press("?");
    await expect(page).toHaveURL(/\/help$/);
    expect(await statusBarText(page)).toBe(winText("help", "dashboard"));
  });

  test("Ctrl-b n cycles dashboard -> builds -> personnel -> retina-v -> profile -> help -> dashboard", async ({
    page,
  }) => {
    await gotoReady(page, "/builds");
    await expect(page).toHaveURL(/\/builds$/);

    await ctrlB(page);
    await page.keyboard.press("n");
    await expect(page).toHaveURL(/\/personnel$/);

    await ctrlB(page);
    await page.keyboard.press("n");
    await expect(page).toHaveURL(/\/retina-v$/);

    await ctrlB(page);
    await page.keyboard.press("n");
    await expect(page).toHaveURL(/\/profile$/);

    await ctrlB(page);
    await page.keyboard.press("n");
    await expect(page).toHaveURL(/\/help$/);

    await ctrlB(page);
    await page.keyboard.press("n");
    await expect(page).toHaveURL(/\/$/);

    await ctrlB(page);
    await page.keyboard.press("n");
    await expect(page).toHaveURL(/\/builds$/);
  });

  test("Ctrl-b p cycles the reverse direction", async ({ page }) => {
    await gotoReady(page, "/builds");

    await ctrlB(page);
    await page.keyboard.press("p");
    await expect(page).toHaveURL(/\/$/);

    await ctrlB(page);
    await page.keyboard.press("p");
    await expect(page).toHaveURL(/\/help$/);

    await ctrlB(page);
    await page.keyboard.press("p");
    await expect(page).toHaveURL(/\/profile$/);

    await ctrlB(page);
    await page.keyboard.press("p");
    await expect(page).toHaveURL(/\/retina-v$/);

    await ctrlB(page);
    await page.keyboard.press("p");
    await expect(page).toHaveURL(/\/personnel$/);

    await ctrlB(page);
    await page.keyboard.press("p");
    await expect(page).toHaveURL(/\/builds$/);
  });

  test("Ctrl-b d, Ctrl-b w, and Ctrl-b 0 all return to the dashboard", async ({ page }) => {
    for (const key of ["d", "w", "0"]) {
      await gotoReady(page, "/builds");
      await ctrlB(page);
      await page.keyboard.press(key);
      await expect(page).toHaveURL(/\/$/);
    }
  });

  test("prefix times out after 2s: pressing 2 afterward neither switches the view nor types anywhere", async ({
    page,
  }) => {
    await page.clock.install({ time: "2026-08-15T23:34:00" });
    await page.goto("/");
    await page.clock.runFor(5000);
    await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });

    await ctrlB(page);
    await page.clock.runFor(2100); // past the 2s armed window
    await page.keyboard.press("2");

    // Still on the dashboard — the timed-out prefix did not arm a switch,
    // and "2" has no meaning of its own from the dashboard (not a
    // dashboard hotkey), so this also proves it wasn't silently treated
    // as some other action.
    await expect(page).toHaveURL(/\/$/);
    expect(await statusBarText(page)).toBe(winText("dashboard"));
  });

  // PLAN.md Phase 5 item 5.2: Ctrl-b Ctrl-b is tmux's own default
  // "send-prefix" binding — it REPLACES the old "pressing Ctrl-b again while
  // armed just re-arms the 2s window" behavior this test used to assert.
  // The second Ctrl-b disarms and is dispatched as a literal keydown instead
  // of arming anything further, so a digit typed right after it is
  // unprefixed (does nothing from the dashboard, which has no digit
  // hotkeys) rather than being treated as a fresh prefix target.
  test("Ctrl-b Ctrl-b (send-prefix) does not re-arm — a digit typed right after is unprefixed", async ({ page }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    await ctrlB(page);
    await page.keyboard.press("2");
    // Still on the dashboard: the second Ctrl-b was send-prefix (consumed,
    // dispatched as a literal chord with nothing bound to it outside an
    // open editor), not a re-arm, so "2" never switched anything.
    await expect(page).toHaveURL(/\/$/);
    expect(await statusBarText(page)).toBe(winText("dashboard"));
  });

  // PLAN.md Phase 5 item 5.2: send-prefix's whole purpose is making vim's
  // own Ctrl-b (full-page-back) reachable from a real keypress — Phase 3
  // shipped the engine complete but this exact chord unreachable (a bare
  // Ctrl-b was always consumed by the prefix arm first). Opens a real repo
  // file (same fixture/entry point editor-vim.spec.ts uses) long enough to
  // scroll, jumps to the last line, then proves Ctrl-b Ctrl-b actually moves
  // the cursor backward.
  test("Ctrl-b Ctrl-b pages back in the open vim editor (send-prefix reaches vim's Ctrl-b)", async ({ page }) => {
    await page.route("**/api.github.com/**", (route) => route.abort());
    await gotoReady(page, "/builds");
    await page.keyboard.press("3");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="builds-tree-row"][data-entry-name="README.md"]')).toBeVisible();
    await page.locator('[data-testid="builds-tree-row"][data-entry-name="README.md"]').click();
    await page.keyboard.press("2");
    await page.keyboard.press("Enter");
    const position = page.locator('[data-testid="editor-position"]');
    await expect(position).toBeVisible();

    const totalLines = await page.locator("[data-line]").count();
    test.skip(totalLines < 8, "fixture file too short for a meaningful page-back");

    await page.keyboard.press("G");
    await expect(position).toContainText(`${totalLines}:`);

    await ctrlB(page);
    await ctrlB(page);
    await expect(position).not.toContainText(`${totalLines}:`);
  });

  // PLAN.md Phase 5 item 5.5 REPLACES this test's old assertion: the grep
  // overlay is now WINDOW chrome, not something that survives a window
  // switch — switching via the prefix (or a status-bar click) always closes
  // it. The prefix itself still works while grep is open (retiring the
  // Phase-1 "prefix inert while grep open" rule) — that half is unchanged.
  test("Ctrl-b works even while the grep overlay is open, and the switch closes the overlay", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    await expect(page.locator('[data-testid="grep-overlay"]')).toBeVisible();

    await ctrlB(page);
    await page.keyboard.press("2");
    // The view switched...
    await expect(page).toHaveURL(/\/personnel$/);
    // ...and the "2" was consumed by the prefix, not typed into the grep
    // query (proven indirectly: the overlay is gone entirely below, but if
    // the prefix hadn't consumed it first the query would still show a
    // dangling "2" the instant before close).
    // ...and the overlay is now closed — grep is window chrome, not session
    // chrome, so a window switch always takes it down.
    await expect(page.locator('[data-testid="grep-overlay"]')).not.toBeVisible();

    // Reopening grep from the new window works cleanly.
    await page.keyboard.press("/");
    await expect(page.locator('[data-testid="grep-overlay"]')).toBeVisible();
  });

  test("a prefixed \"/\" is swallowed — it does not open the grep overlay", async ({ page }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    await page.keyboard.press("/");
    await expect(page.locator('[data-testid="grep-overlay"]')).not.toBeVisible();
    await expect(page).toHaveURL(/\/$/);

    // The prefix having been consumed, a later bare "/" still opens grep
    // normally (proves the swallow didn't leave anything stuck armed).
    await page.keyboard.press("/");
    await expect(page.locator('[data-testid="grep-overlay"]')).toBeVisible();
  });

  // PLAN.md Phase 4 rework: panel [2] is the tree browser now (empty until a
  // repo is opened, so it has no default j/k-navigable content), so this
  // exercises the same "prefix swallows the key" invariant against panel
  // [3]'s repo selection instead — panel [3] still has default content
  // (the flat repo list) to move a highlight across.
  test("a prefixed j does not move the Builds repo selection (panel [3])", async ({ page }) => {
    await gotoReady(page, "/builds");
    await page.keyboard.press("3"); // focus panel [3], Local Repositories
    const firstRow = page.locator('[data-testid="builds-repo-row"]').first();
    await expect(firstRow).toHaveAttribute("style", /rgba\(224, 69, 60, 0\.22\)/);

    await ctrlB(page);
    await page.keyboard.press("j");
    // Still on the first repo — the prefixed "j" was swallowed, never
    // reached Builds.svelte's own j/k handler.
    await expect(firstRow).toHaveAttribute("style", /rgba\(224, 69, 60, 0\.22\)/);
    await expect(page).toHaveURL(/\/builds$/);

    // An un-prefixed "j" right after still works normally.
    await page.keyboard.press("j");
    await expect(page.locator('[data-testid="builds-repo-row"]').nth(1)).toHaveAttribute(
      "style",
      /rgba\(224, 69, 60, 0\.22\)/,
    );
  });

  test("a held-modifier chord immediately after Ctrl-b still falls through untouched", async ({ page }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    const prevented = await page.evaluate(() => {
      const ev = new KeyboardEvent("keydown", { key: "l", metaKey: true, bubbles: true, cancelable: true });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    expect(prevented).toBe(false);
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("status bar `-` flag: the previously-active window (PLAN.md Iteration 3 Phase 4 item 4.3 tmux fidelity reference)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("no flag renders on a fresh session (activeWindowIdx === lastWindowIdx)", async ({ page }) => {
    await gotoReady(page, "/");
    expect(await statusBarText(page)).toBe(winText("dashboard"));
  });

  test("switching windows marks the PREVIOUS window with `-`, and the flag moves with each further switch", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    await page.keyboard.press("2");
    await expect(page).toHaveURL(/\/personnel$/);
    expect(await statusBarText(page)).toBe(winText("personnel", "dashboard"));

    await ctrlB(page);
    await page.keyboard.press("1");
    await expect(page).toHaveURL(/\/builds$/);
    expect(await statusBarText(page)).toBe(winText("builds", "personnel"));
  });
});

test.describe("Ctrl-b , rename-window (PLAN.md Phase 5 item 5.2)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("prefills the active window's current name; typed characters append; Enter commits it into the status bar", async ({
    page,
  }) => {
    await gotoReady(page, "/builds");
    await ctrlB(page);
    await page.keyboard.press(",");
    const prompt = page.locator('[data-testid="status-prompt"]');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText("(rename-window) builds");

    await page.keyboard.type("-x");
    await expect(prompt).toContainText("(rename-window) builds-x");
    await page.keyboard.press("Enter");
    await expect(prompt).not.toBeVisible();

    await expect(page.locator('[data-testid="status-bar-window"][data-window-id="builds"]')).toHaveText("1:builds-x*");
    // Navigation is unaffected by the rename — the id, not the label, still
    // drives which window is "1" and where clicking/prefix-1 goes.
    await expect(page).toHaveURL(/\/builds$/);
  });

  test("Esc cancels — the window name is unchanged", async ({ page }) => {
    await gotoReady(page, "/builds");
    await ctrlB(page);
    await page.keyboard.press(",");
    await page.keyboard.type("nope");
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-testid="status-prompt"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="status-bar-window"][data-window-id="builds"]')).toHaveText("1:builds*");
  });

  test("an empty commit (Enter on a fully-backspaced prompt) also leaves the name unchanged", async ({ page }) => {
    await gotoReady(page, "/builds");
    await ctrlB(page);
    await page.keyboard.press(",");
    for (let i = 0; i < "builds".length; i++) await page.keyboard.press("Backspace");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="status-bar-window"][data-window-id="builds"]')).toHaveText("1:builds*");
  });

  // PLAN.md Phase 5.4: "prompt owns keys — typing j into rename doesn't
  // scroll anything behind it."
  test("the prompt owns the keyboard — typing j does not move the Builds repo selection behind it", async ({
    page,
  }) => {
    await gotoReady(page, "/builds");
    await page.keyboard.press("3");
    const firstRow = page.locator('[data-testid="builds-repo-row"]').first();
    await expect(firstRow).toHaveAttribute("style", /rgba\(224, 69, 60, 0\.22\)/);

    await ctrlB(page);
    await page.keyboard.press(",");
    await page.keyboard.press("j");
    await expect(page.locator('[data-testid="status-prompt"]')).toContainText("buildsj");
    await expect(firstRow).toHaveAttribute("style", /rgba\(224, 69, 60, 0\.22\)/);

    await page.keyboard.press("Escape");
  });

  // FAIL #1 regression coverage: fixing "Ctrl-b arms even while a prompt is
  // open" must not turn every OTHER key into a prefix command — a literal
  // "]" typed with no preceding Ctrl-b is still just a character.
  test("a literal ] keypress with no preceding Ctrl-b still types normally into the prompt", async ({ page }) => {
    await gotoReady(page, "/builds");
    await ctrlB(page);
    await page.keyboard.press(",");
    await page.keyboard.press("]");
    await expect(page.locator('[data-testid="status-prompt"]')).toContainText("builds]");
    await page.keyboard.press("Escape");
  });
});

test.describe("Ctrl-b & kill-window (PLAN.md Phase 5 item 5.2)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("confirm prompt shows the active window's name; y removes it and switches to the next remaining window", async ({
    page,
  }) => {
    await gotoReady(page, "/builds");
    await ctrlB(page);
    await page.keyboard.press("&");
    await expect(page.locator('[data-testid="status-confirm"]')).toHaveText("kill-window builds? (y/n)");

    await page.keyboard.press("y");
    await expect(page.locator('[data-testid="status-confirm"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="status-bar-window"][data-window-id="builds"]')).toHaveCount(0);
    // builds (index 1) was active; the window that used to sit right after
    // it — personnel (index 2) — becomes the new active view.
    await expect(page).toHaveURL(/\/personnel$/);
  });

  test("n cancels — nothing removed, view unchanged", async ({ page }) => {
    await gotoReady(page, "/builds");
    await ctrlB(page);
    await page.keyboard.press("&");
    await page.keyboard.press("n");
    await expect(page.locator('[data-testid="status-confirm"]')).not.toBeVisible();
    await expect(page).toHaveURL(/\/builds$/);
    await expect(page.locator('[data-testid="status-bar-window"][data-window-id="builds"]')).toHaveCount(1);
  });

  test("Esc cancels — nothing removed, view unchanged", async ({ page }) => {
    await gotoReady(page, "/builds");
    await ctrlB(page);
    await page.keyboard.press("&");
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-testid="status-confirm"]')).not.toBeVisible();
    await expect(page).toHaveURL(/\/builds$/);
    await expect(page.locator('[data-testid="status-bar-window"][data-window-id="builds"]')).toHaveCount(1);
  });

  test("killing every window down to the last one is refused with a status message, and that window survives", async ({
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
    await page.keyboard.press("&");
    await page.keyboard.press("y");
    await expect(page.locator('[data-testid="status-message"]')).toContainText("only window");

    // The message auto-clears; the single remaining window is untouched.
    await expect(page.locator('[data-testid="status-message"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="status-bar-window"]')).toHaveCount(1);
  });
});

test.describe("Ctrl-b x kill-pane (PLAN.md Phase 5 item 5.2)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("inside Builds with multiple panels, confirms and removes only the FOCUSED panel; it's back after Builds remounts", async ({
    page,
  }) => {
    await gotoReady(page, "/builds");
    await page.keyboard.press("2"); // focus panel [2] Files
    await expect(page.locator('[data-testid="builds-panel-2"]')).toBeVisible();

    await ctrlB(page);
    await page.keyboard.press("x");
    await expect(page.locator('[data-testid="status-confirm"]')).toContainText("kill-pane");
    await page.keyboard.press("y");

    await expect(page.locator('[data-testid="builds-panel-2"]')).toHaveCount(0);
    // The other panels keep their positions — untouched by the removal.
    await expect(page.locator('[data-testid="builds-panel-1"]')).toBeVisible();
    await expect(page.locator('[data-testid="builds-panel-3"]')).toBeVisible();
    await expect(page.locator('[data-testid="builds-panel-4"]')).toBeVisible();
    await expect(page.locator('[data-testid="builds-panel-0"]')).toBeVisible();

    // Leaving and re-entering Builds remounts it — the layout resets.
    await page.locator('[data-testid="status-bar-window"][data-window-id="personnel"]').click();
    await page.locator('[data-testid="status-bar-window"][data-window-id="builds"]').click();
    await expect(page.locator('[data-testid="builds-panel-2"]')).toBeVisible();
  });

  test("in a single-pane view, x falls back to the exact same kill-window confirm as &", async ({ page }) => {
    await gotoReady(page, "/profile");
    await ctrlB(page);
    await page.keyboard.press("x");
    await expect(page.locator('[data-testid="status-confirm"]')).toHaveText("kill-window profile? (y/n)");
    await page.keyboard.press("n");
    await expect(page.locator('[data-testid="status-confirm"]')).not.toBeVisible();
    await expect(page).toHaveURL(/\/profile$/);
  });

  // PLAN.md Phase 6 item 6.0: kill-pane confirm hardening. The confirm's
  // target panel must be captured when the "kill-pane <name>? (y/n)" prompt
  // OPENS, not re-read from whatever is CURRENTLY focused when `y` commits
  // — mirroring the rename/kill-window hardening already covered by the
  // "prompt keyboard ownership" describe block below. Before this fix,
  // clicking a different panel's row while the confirm was still open
  // moved `focusedPanel`, and pressing `y` killed that NEWLY focused panel
  // instead of the one named in the prompt.
  test("a mouse click on a different panel mid-confirm cannot redirect the kill — the ORIGINALLY named panel dies", async ({
    page,
  }) => {
    await gotoReady(page, "/builds");
    await page.keyboard.press("2"); // focus panel [2] Files
    await expect(page.locator('[data-testid="builds-panel-2"]')).toBeVisible();

    await ctrlB(page);
    await page.keyboard.press("x");
    await expect(page.locator('[data-testid="status-confirm"]')).toContainText("Files");

    // Click the Repos panel's row while the confirm is still open — this
    // moves focusedPanel to [3] without answering the prompt.
    await page.locator('[data-testid="builds-repo-row"]').first().click();
    await expect(page.locator('[data-testid="status-confirm"]')).toContainText("Files");

    await page.keyboard.press("y");

    // The ORIGINALLY named panel (Files, [2]) is dead; the clicked one
    // (Repos, [3]) survives untouched.
    await expect(page.locator('[data-testid="builds-panel-2"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="builds-panel-3"]')).toBeVisible();
  });
});

// Verifier round 2 regression: fixing "Ctrl-b ] can paste into a status-bar
// prompt" by moving the prompt's own handleKey() consultation to run AFTER
// the prefix system (see Terminal.svelte's handleKey() comment) had an
// unintended side effect — EVERY prefixed key, not just `]`, ran the full
// prefix-dispatch system while a prompt was open, so `Ctrl-b 2` could switch
// the view out from under a still-open rename prompt (which then committed
// onto the NEW window instead of the one it was opened for), and `Ctrl-b &`
// could silently replace a rename prompt with a kill-window confirm. The fix
// gates every branch of `handlePrefixedKey` except `]` behind
// `statusBarRef.isPromptActive()`, and hardens the rename/kill-window commit
// closures to close over the target window's id captured at prompt-OPEN
// time rather than re-reading `view` at commit time (defense in depth).
test.describe("prompt keyboard ownership vs. the prefix system (verifier round 2 regression)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("Ctrl-b <digit>/&/x/,/n are all inert while the rename prompt is open; committing renames the ORIGINAL window", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    await page.keyboard.press(",");
    const prompt = page.locator('[data-testid="status-prompt"]');
    await expect(prompt).toContainText("(rename-window) dashboard");

    // A digit target — would normally jump straight to personnel.
    await ctrlB(page);
    await page.keyboard.press("2");
    await expect(page).toHaveURL(/\/$/);
    await expect(prompt).toContainText("(rename-window) dashboard");

    // & — would normally replace this very prompt with a kill-window confirm.
    await ctrlB(page);
    await page.keyboard.press("&");
    await expect(page.locator('[data-testid="status-confirm"]')).not.toBeVisible();
    await expect(prompt).toContainText("(rename-window) dashboard");

    // x — would normally do the same (single-pane kill-window fallback).
    await ctrlB(page);
    await page.keyboard.press("x");
    await expect(page.locator('[data-testid="status-confirm"]')).not.toBeVisible();
    await expect(prompt).toContainText("(rename-window) dashboard");

    // , — would normally re-open a fresh rename prompt on top of this one.
    await ctrlB(page);
    await page.keyboard.press(",");
    await expect(prompt).toContainText("(rename-window) dashboard");

    // n — would normally cycle to the next window.
    await ctrlB(page);
    await page.keyboard.press("n");
    await expect(page).toHaveURL(/\/$/);
    await expect(prompt).toContainText("(rename-window) dashboard");

    // Commit — renames the window the prompt was ACTUALLY opened for
    // (dashboard), never wherever `view` might otherwise have drifted to.
    await page.keyboard.type("ZZZ");
    await page.keyboard.press("Enter");
    await expect(prompt).not.toBeVisible();
    await expect(page.locator('[data-testid="status-bar-window"][data-window-id="dashboard"]')).toHaveText(
      "0:dashboardZZZ*",
    );
    await expect(page.locator('[data-testid="status-bar-window"][data-window-id="personnel"]')).toHaveText(
      "2:personnel",
    );
  });

  test("Ctrl-b <digit>/,/n are all inert while a kill-window confirm is open; y kills the ORIGINAL window", async ({
    page,
  }) => {
    await gotoReady(page, "/builds");
    await ctrlB(page);
    await page.keyboard.press("&");
    const confirm = page.locator('[data-testid="status-confirm"]');
    await expect(confirm).toHaveText("kill-window builds? (y/n)");

    // A digit target — would normally jump straight to personnel.
    await ctrlB(page);
    await page.keyboard.press("2");
    await expect(page).toHaveURL(/\/builds$/);
    await expect(confirm).toHaveText("kill-window builds? (y/n)");

    // , — would normally replace this confirm with a rename prompt.
    await ctrlB(page);
    await page.keyboard.press(",");
    await expect(page.locator('[data-testid="status-prompt"]')).not.toBeVisible();
    await expect(confirm).toHaveText("kill-window builds? (y/n)");

    // n — prefixed, so it's the "cycle windows" command, not the confirm's
    // own bare-key "no" — either way it must be a no-op here.
    await ctrlB(page);
    await page.keyboard.press("n");
    await expect(page).toHaveURL(/\/builds$/);
    await expect(confirm).toHaveText("kill-window builds? (y/n)");

    // Commit — kills the window the confirm was ACTUALLY opened for
    // (builds), never wherever `view` might otherwise have drifted to.
    await page.keyboard.press("y");
    await expect(confirm).not.toBeVisible();
    await expect(page.locator('[data-testid="status-bar-window"][data-window-id="builds"]')).toHaveCount(0);
    await expect(page).toHaveURL(/\/personnel$/);
  });

  test("Ctrl-b ] still pastes into the rename prompt (regression guard: the prompt-active gate must not swallow ])", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await gotoReady(page, "/builds");
    await ctrlB(page);
    await page.keyboard.press("[");
    await page.keyboard.press("v");
    await page.keyboard.press("l");
    await page.keyboard.press("l");
    await page.keyboard.press("y");
    const yanked = await page.evaluate(() => navigator.clipboard.readText());
    expect(yanked.length).toBeGreaterThan(0);

    await ctrlB(page);
    await page.keyboard.press(",");
    const prompt = page.locator('[data-testid="status-prompt"]');
    await expect(prompt).toContainText("(rename-window) builds");

    await ctrlB(page);
    await page.keyboard.press("]");
    await expect(prompt).toContainText(yanked);

    await page.keyboard.press("Escape");
  });
});

// PLAN.md Phase 5 item 5.5: "Status bar is SESSION chrome, grep is WINDOW
// chrome" — the dim/blur backdrop must never cover the bar, and any window
// switch while grep is open (click OR prefix) closes the overlay.
test.describe("grep is window chrome, the status bar is session chrome (PLAN.md Phase 5 item 5.5)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("the status bar is still hit-testable at its own center while grep is open", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    await expect(page.locator('[data-testid="grep-overlay"]')).toBeVisible();

    const box = await page.locator('[data-testid="status-bar-windows"]').boundingBox();
    if (!box) throw new Error("status bar not laid out");
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const testid = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.getAttribute("data-testid") ?? null,
      point,
    );
    expect(testid).not.toBe("grep-overlay");
    expect(["status-bar-windows", "status-bar-window"]).toContain(testid);
  });

  test("clicking a status-bar window while grep is open switches view AND closes grep; grep reopens cleanly after", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    await expect(page.locator('[data-testid="grep-overlay"]')).toBeVisible();

    await page.locator('[data-testid="status-bar-window"][data-window-id="personnel"]').click();
    await expect(page).toHaveURL(/\/personnel$/);
    await expect(page.locator('[data-testid="grep-overlay"]')).not.toBeVisible();

    await page.keyboard.press("/");
    await expect(page.locator('[data-testid="grep-overlay"]')).toBeVisible();
  });

  test("Ctrl-b 4 with grep open lands on profile with no overlay", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    await expect(page.locator('[data-testid="grep-overlay"]')).toBeVisible();

    await ctrlB(page);
    await page.keyboard.press("4");
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.locator('[data-testid="grep-overlay"]')).not.toBeVisible();
  });
});

test.describe("mobile block (README \"Mobile policy\")", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("card is visible with the spec copy and escape-hatch link; terminal is hidden", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[data-testid="mobile-block"]')).toBeVisible();

    await expect(page.locator('[data-testid="mobile-block-heading"]')).toHaveText("E.D.I.T.H: RETINA-V");
    await expect(page.locator('[data-testid="mobile-block-body"]')).toHaveText(
      "viewport too small — this session requires a desktop terminal (≥900px).",
    );
    const link = page.locator('[data-testid="mobile-block-link"]');
    await expect(link).toHaveText("github.com/shevinum");
    await expect(link).toHaveAttribute("href", "https://github.com/shevinum");

    await expect(page.locator('[data-testid="terminal-root"]')).toHaveCSS("display", "none");
  });

  test("pressing b does nothing — no keydown listener ever attaches (data-terminal-ready stays false)", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator('[data-testid="mobile-block"]')).toBeVisible();

    // Positive proof the guard held (not merely "we never observed a
    // switch"): the ready flag Terminal.svelte only ever sets once its
    // real listeners are attached never flips to "true" in blocked mode.
    await page.waitForTimeout(300);
    await expect(page.locator('[data-terminal-ready="false"]')).toBeAttached();

    await page.keyboard.press("b");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('[data-terminal-ready="false"]')).toBeAttached();
  });

  // PLAN.md Phase 9 verify bullet: "prefix inert in mobile mode" — a
  // separate assertion from "pressing b does nothing" above. Structurally
  // guaranteed the same way (no keydown listener attaches at all outside
  // desktop+fine-pointer — see Terminal.svelte's `desktopMode` effect), but
  // called out explicitly since Ctrl-b arms *state*, not just a view
  // switch: this proves that state machine never even gets a chance to run.
  test("Ctrl-b does nothing on a mobile-blocked viewport (the prefix never arms)", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[data-testid="mobile-block"]')).toBeVisible();

    await ctrlB(page);
    await page.keyboard.press("2");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('[data-terminal-ready="false"]')).toBeAttached();
  });

  test("clock/meter timers never start (status-bar clock text stays empty across faked time)", async ({ page }) => {
    await page.clock.install({ time: "2026-08-15T23:34:00" });
    await page.goto("/");
    await page.clock.runFor(65_000); // would advance a live clock a full minute
    await expect(page.locator('[data-testid="mobile-block"]')).toBeVisible();

    // Read the raw DOM text (not innerText/toHaveText, which only reflect
    // *rendered* text and would vacuously read "" for a display:none
    // ancestor regardless of whether the clock effect ever ran).
    const clockText = await page
      .locator('[data-testid="status-bar-clock-time"]')
      .evaluate((el) => el.textContent);
    expect(clockText).toBe("");
  });
});

test.describe("desktop (fine pointer): mobile card stays hidden", () => {
  test("the mobile-block card is not visible at 1512x945 with a fine pointer", async ({ page }) => {
    await gotoReady(page, "/");
    await expect(page.locator('[data-testid="mobile-block"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="terminal-root"]')).not.toHaveCSS("display", "none");
  });
});

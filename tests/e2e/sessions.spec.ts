// Behavioral e2e suite for detach/sessions (PLAN.md Iteration 3 Phase 5) —
// `Ctrl-b d` detach to the fullscreen HOST shell (src/components/Shell.svelte,
// `mode: "host"`) over the dimmed radar, its `tmux ls`/`new [-s name]`/
// `a [-t name]`/`edith`/`open <view>` builtins, the kill-cascade rules that
// destroy a session outright once its last window dies, and the host `exit`
// (`logout` + reload). Companion to tests/e2e/shell.spec.ts (the in-window
// shell) and tests/e2e/tmux.spec.ts (the prefix state machine, including its
// own updated "w/0 still go home, d now detaches" and "[exited]" cascade
// coverage) — this file is the one that actually exercises SESSIONS.
import { expect, test, type Page } from "./fixtures.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { formatCtime } from "../../src/lib/clock.ts";

const ROOT = join(import.meta.dirname, "../..");

interface ShellYaml {
  host: {
    narrative: { text: string; kind: string }[];
    detachedTemplate: string;
    exitedMessage: string;
    logoutMessage: string;
    notAttachedMessage: string;
    windowGoneTemplate: string;
  };
  tmux: { lsRowTemplate: string; lsAttachedSuffix: string; noSessionsMessage: string };
}

function loadShellYaml(): ShellYaml {
  return YAML.parse(readFileSync(join(ROOT, "src/data/shell.yaml"), "utf8")) as ShellYaml;
}

const shellYaml = loadShellYaml();
const DEFAULT_SESSION_NAME = "10.42.7.13";
const CLOCK_TIME = "2026-08-15T23:34:00";

function narrativeLine(i: number): string {
  return shellYaml.host.narrative[i].text.replace("{session}", DEFAULT_SESSION_NAME);
}

function detachedLine(name: string = DEFAULT_SESSION_NAME): string {
  return shellYaml.host.detachedTemplate.replace("{name}", name);
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

async function detach(page: Page) {
  await ctrlB(page);
  await page.keyboard.press("d");
}

async function runInShell(page: Page, line: string) {
  await page.keyboard.type(line);
  await page.keyboard.press("Enter");
}

const hostShell = (page: Page) => page.locator('[data-shell-mode="host"]');
const scroller = (page: Page) => page.locator('[data-testid="shell-scroller"]');
const shellInput = (page: Page) => page.locator('[data-testid="shell-input"]');
const shellPrompt = (page: Page) => page.locator('[data-testid="shell-prompt"]');
const statusWindow = (page: Page, id: string) => page.locator(`[data-testid="status-bar-window"][data-window-id="${id}"]`);
const statusBarWindows = (page: Page) => page.locator('[data-testid="status-bar-windows"]');
const sessionLabel = (page: Page) => page.locator('[data-testid="status-bar-session"]');

test.describe("Ctrl-b d detaches to the host shell (PLAN.md Iteration 3 Phase 5 item 5.1)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("shows the pre-seeded narrative + a fresh [detached] line, no status bar, dim radar", async ({ page }) => {
    await gotoReady(page, "/");
    await detach(page);

    await expect(hostShell(page)).toBeVisible();
    await expect(statusBarWindows(page)).not.toBeVisible();

    for (let i = 0; i < shellYaml.host.narrative.length; i++) {
      await expect(scroller(page)).toContainText(narrativeLine(i));
    }
    await expect(page.locator('[data-testid="shell-line"]').last()).toHaveText(detachedLine());
    await expect(shellPrompt(page)).toContainText("git:(main) $");

    // Radar stays visible but dim (Locked #? / item 5.1 "very dark, radar
    // faint behind") — a coarse numeric check (not an exact string) since
    // the precise dim value is an executor design choice, not a fidelity-
    // locked constant.
    const opacity = await page.locator('[data-testid="wallpaper-layer"]').evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(opacity).toBeLessThan(0.3);
    expect(opacity).toBeGreaterThan(0);
  });

  test("the host shell buffer persists across a detach -> reattach -> detach round trip", async ({ page }) => {
    await gotoReady(page, "/");
    await detach(page);
    await runInShell(page, "whoami");
    await expect(scroller(page)).toContainText("shev");

    await runInShell(page, "edith");
    await expect(statusBarWindows(page)).toBeVisible();

    await detach(page);
    // The SAME buffer — "whoami"'s output from before is still there, on
    // top of a second LIVE [detached] line now appended (the pre-seeded
    // narrative itself already contains one such line — see shell.yaml's
    // own `host.narrative` — so two REAL detaches makes three total).
    await expect(scroller(page)).toContainText("shev");
    const detachLines = await page.locator('[data-testid="shell-line"]', { hasText: detachedLine() }).count();
    expect(detachLines).toBe(3);
  });

  test("the tmux prefix is INERT while detached: Ctrl-b d again does not re-detach, Ctrl-b 1 does not attach — both keystrokes land as ordinary typed characters in the host shell", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await detach(page);
    const linesBefore = await page.locator('[data-testid="shell-line"]').count();

    // Ctrl-b itself never arms anything while detached (no preventDefault,
    // no side effect) — the FOLLOWING bare key (no modifier) is therefore
    // an ordinary keystroke the host shell's own input claims, exactly like
    // any other unprefixed character. This is the discriminating proof of
    // "inert": if the prefix HAD armed, "d" would either re-detach (no-op,
    // already detached) or "1" would attach — neither happens, and both
    // characters instead show up in the live input line.
    await ctrlB(page);
    await page.keyboard.press("d");
    await expect(shellInput(page)).toHaveText("d");
    expect(await page.locator('[data-testid="shell-line"]').count()).toBe(linesBefore); // no new [detached] line
    await expect(statusBarWindows(page)).not.toBeVisible(); // still detached

    await page.keyboard.press("Backspace"); // clear "d" before the next probe
    await ctrlB(page);
    await page.keyboard.press("1");
    await expect(shellInput(page)).toHaveText("1");
    await expect(statusBarWindows(page)).not.toBeVisible(); // did not attach
  });
});

test.describe("tmux ls (PLAN.md tmux fidelity reference)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("lists the default session with NO (attached) suffix while detached — exact format", async ({ page }) => {
    await page.clock.install({ time: CLOCK_TIME });
    await gotoReady(page, "/");
    await detach(page);
    await runInShell(page, "tmux ls");

    const expectedRow = shellYaml.tmux.lsRowTemplate
      .replace("{name}", DEFAULT_SESSION_NAME)
      .replace("{n}", "6")
      .replace("{ctime}", formatCtime(new Date(Date.parse(CLOCK_TIME))));
    await expect(page.locator('[data-testid="shell-line"]').last()).toHaveText(expectedRow);
  });

  test("shows (attached) for the currently attached session from inside a PANE shell", async ({ page }) => {
    await page.clock.install({ time: CLOCK_TIME });
    await gotoReady(page, "/");
    await page.keyboard.press(":");
    await runInShell(page, "q");
    await runInShell(page, "tmux ls");

    const expectedRow =
      shellYaml.tmux.lsRowTemplate
        .replace("{name}", DEFAULT_SESSION_NAME)
        .replace("{n}", "6")
        .replace("{ctime}", formatCtime(new Date(Date.parse(CLOCK_TIME)))) + shellYaml.tmux.lsAttachedSuffix;
    await expect(page.locator('[data-testid="shell-line"]').last()).toHaveText(expectedRow);
  });
});

test.describe("tmux new [-s name] (host mode)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("tmux new -s test creates AND attaches — status bar shows Session: test, window 0:zsh", async ({ page }) => {
    await gotoReady(page, "/");
    await detach(page);
    await runInShell(page, "tmux new -s test");

    await expect(statusBarWindows(page)).toBeVisible();
    await expect(sessionLabel(page)).toHaveText("Session: test");
    await expect(page.locator('[data-testid="status-bar-window"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="status-bar-window"]')).toHaveText("0:zsh*");
  });

  test("a duplicate -s name errors and stays detached", async ({ page }) => {
    await gotoReady(page, "/");
    await detach(page);
    await runInShell(page, `tmux new -s ${DEFAULT_SESSION_NAME}`);
    await expect(scroller(page)).toContainText(`duplicate session: ${DEFAULT_SESSION_NAME}`);
    await expect(statusBarWindows(page)).not.toBeVisible();
  });

  test("bare tmux new auto-numbers the session", async ({ page }) => {
    await gotoReady(page, "/");
    await detach(page);
    await runInShell(page, "tmux new");
    await expect(sessionLabel(page)).toHaveText("Session: 1");
  });
});

test.describe("tmux a / attach (host mode)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("tmux a -t 10.42.7.13 reattaches with the prior window state intact (renames/kills preserved)", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    // Rename builds, kill profile, then detach.
    await ctrlB(page);
    await page.keyboard.press("1");
    await ctrlB(page);
    await page.keyboard.press(",");
    for (let i = 0; i < "builds".length; i++) await page.keyboard.press("Backspace");
    await page.keyboard.type("myrename");
    await page.keyboard.press("Enter");

    await ctrlB(page);
    await page.keyboard.press("4");
    await ctrlB(page);
    await page.keyboard.press("&");
    await page.keyboard.press("y");

    await detach(page);
    await runInShell(page, `tmux a -t ${DEFAULT_SESSION_NAME}`);

    await expect(statusBarWindows(page)).toBeVisible();
    await expect(statusWindow(page, "builds")).toHaveText("1:myrename");
    await expect(statusWindow(page, "profile")).toHaveCount(0);
  });

  test("tmux a -t <missing name> errors — exact fidelity string, stays detached", async ({ page }) => {
    await gotoReady(page, "/");
    await detach(page);
    await runInShell(page, "tmux a -t nope");
    await expect(scroller(page)).toContainText("can't find session: nope");
    await expect(statusBarWindows(page)).not.toBeVisible();
  });

  test("bare tmux a attaches the MOST RECENTLY USED session, not merely the first", async ({ page }) => {
    await gotoReady(page, "/");
    await detach(page);
    await runInShell(page, "tmux new -s test"); // creates + attaches "test" (now most recent)
    await detach(page); // "test" was the most-recently attached
    await runInShell(page, "tmux a");
    await expect(sessionLabel(page)).toHaveText("Session: test");
  });

  test("bare tmux a with no sessions at all errors — exact fidelity string", async ({ page }) => {
    await gotoReady(page, "/");
    for (let i = 0; i < 5; i++) {
      await ctrlB(page);
      await page.keyboard.press("&");
      await page.keyboard.press("y");
    }
    await ctrlB(page);
    await page.keyboard.press("&");
    await page.keyboard.press("y");
    // Last window of the only session — [exited].
    await expect(page.locator('[data-testid="shell-line"]').last()).toHaveText(shellYaml.host.exitedMessage);

    await runInShell(page, "tmux a");
    await expect(scroller(page)).toContainText("no sessions");
  });
});

test.describe("kill cascades: destroyed session vs. switch-to-remaining (PLAN.md Iteration 3 Phase 5 item 5.3)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("no other sessions remain: the client detaches to the host shell and prints [exited]; the session disappears from tmux ls", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    for (let i = 0; i < 5; i++) {
      await ctrlB(page);
      await page.keyboard.press("&");
      await page.keyboard.press("y");
    }
    await ctrlB(page);
    await page.keyboard.press("&");
    await page.keyboard.press("y");

    await expect(hostShell(page)).toBeVisible();
    await expect(page.locator('[data-testid="shell-line"]').last()).toHaveText(shellYaml.host.exitedMessage);

    await runInShell(page, "tmux ls");
    await expect(scroller(page)).toContainText("no sessions");
  });

  test("another session still exists: the client silently switches to it — no [exited], no host shell interlude", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await detach(page);
    await runInShell(page, "tmux new -s test"); // creates + attaches "test"; default session still exists, detached
    await expect(sessionLabel(page)).toHaveText("Session: test"); // wait for the attach to fully settle (StatusBar mounted) before driving the prefix

    // Kill "test"'s only window — wait for the confirm to actually be up
    // before answering it (this pane runs a bare shell, not a view, so a
    // stray "y" that outraces the confirm's own render would otherwise get
    // typed into the shell's input instead of answering the prompt).
    await ctrlB(page);
    await page.keyboard.press("&");
    await expect(page.locator('[data-testid="status-confirm"]')).toBeVisible();
    await page.keyboard.press("y");

    // Immediately back on the default session's dashboard — no host shell
    // ever appears in between.
    await expect(statusBarWindows(page)).toBeVisible();
    await expect(sessionLabel(page)).toHaveText(`Session: ${DEFAULT_SESSION_NAME}`);
    await expect(page.locator('[data-testid="dashboard-wordmark"]')).toBeVisible();
  });
});

test.describe("edith / open <view> (host mode)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("edith attaches the default session at window 0 (dashboard)", async ({ page }) => {
    await gotoReady(page, "/builds");
    await detach(page);
    await runInShell(page, "edith");
    await expect(statusBarWindows(page)).toBeVisible();
    await expect(page.locator('[data-testid="dashboard-wordmark"]')).toBeVisible();
    await expect(statusWindow(page, "dashboard")).toHaveText("0:dashboard*");
  });

  test("open builds attaches AND selects the builds window", async ({ page }) => {
    await gotoReady(page, "/");
    await detach(page);
    await runInShell(page, "open builds");
    await expect(statusBarWindows(page)).toBeVisible();
    await expect(statusWindow(page, "builds")).toHaveText("1:builds*");
    await expect(page).toHaveURL(/\/builds$/);
  });

  test("open <view> attaches with a status message when that window was killed (PLAN.md 'attach + message')", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    // Kill the builds window before ever detaching.
    await ctrlB(page);
    await page.keyboard.press("1");
    await ctrlB(page);
    await page.keyboard.press("&");
    await expect(page.locator('[data-testid="status-confirm"]')).toBeVisible();
    await page.keyboard.press("y");
    await expect(statusWindow(page, "builds")).toHaveCount(0);

    await detach(page);
    await runInShell(page, "open builds");

    // Attaches anyway (staying on whatever window is already active) — the
    // status bar shows the transient message INSTEAD OF the window list
    // while it's up (StatusBar.svelte's own mutually-exclusive states), so
    // this is checked first; the window list reappears once it auto-clears.
    await expect(page.locator('[data-testid="status-message"]')).toContainText(
      shellYaml.host.windowGoneTemplate.replace("{view}", "builds").replace("{name}", DEFAULT_SESSION_NAME),
    );
    await expect(page.locator('[data-testid="status-message"]')).not.toBeVisible();
    await expect(statusBarWindows(page)).toBeVisible();
  });

  test("a bare view name (no `open`) in host mode prints the not-attached hint instead of attaching", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await detach(page);
    await runInShell(page, "dashboard");
    await expect(scroller(page)).toContainText(shellYaml.host.notAttachedMessage);
    await expect(statusBarWindows(page)).not.toBeVisible();
  });
});

test.describe("host exit / reboot (PLAN.md Iteration 3 Phase 5 items 5.3/5.4)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("exit prints logout then reloads — boot stays skipped, the site lands back on the factory-attached dashboard", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await detach(page);
    // Deliberately not asserting the transient "logout" line itself here:
    // `onHostExit()` appends it and calls `window.location.reload()` in the
    // same synchronous tick, so there is no reliable window in which to
    // observe it before the page navigates out from under the assertion —
    // an inherent race with reload, not a gap in the feature (the exact
    // string lives in shell.yaml and the effect-dispatch wiring is unit-
    // tested via shell.ts's `exit` -> `exit-pane` outcome). What IS
    // reliably observable, and asserted below, is the reload actually
    // happening and where it lands.
    await runInShell(page, "exit");
    await page.waitForURL("**/");
    await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });

    // Boot skipped (this spec's shared context fixture pre-seeds the
    // boot-seen flag — a reload never clears it) and the factory-attached
    // default session is what greets us, not a stale detached state.
    await expect(page.locator('[data-testid="boot-sequence"]')).toHaveCount(0);
    await expect(statusBarWindows(page)).toBeVisible();
    await expect(page.locator('[data-testid="dashboard-wordmark"]')).toBeVisible();
  });

  test("reboot from the host shell factory-resets: boot replays, then the default session is attached again", async ({
    page,
  }) => {
    await page.clock.install({ time: CLOCK_TIME });
    await gotoReady(page, "/");
    await detach(page);
    await runInShell(page, "reboot");

    await expect(page.locator('[data-testid="boot-sequence"]')).toBeVisible();
    await page.clock.runFor(4600 + 760 + 100);
    await expect(page.locator('[data-testid="boot-sequence"]')).toHaveCount(0);

    await expect(statusBarWindows(page)).toBeVisible();
    await expect(page.locator('[data-testid="status-bar-window"]')).toHaveCount(6);
    await expect(sessionLabel(page)).toHaveText(`Session: ${DEFAULT_SESSION_NAME}`);
  });
});

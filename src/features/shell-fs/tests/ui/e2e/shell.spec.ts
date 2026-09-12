// Behavioral e2e suite for the in-window shell — src/features/shell-fs/components/Shell.svelte,
// driven through Terminal.svelte exactly like every other program ref.
// Covers: `:q` dropping a pane's program to a shell with live window
// auto-rename,
// relaunching a program by typing its bare name (round-tripping the
// auto-rename), every documented builtin's real output (against the real
// generated fs-index/grep-index/repo-index JSONs — never hardcoded copies of
// their content, same "assert against the real data" convention
// cmdline.spec.ts's own data-driven sweep uses), shell history (Up/Down),
// reboot's factory-reset of BOTH the tmux client and every pane's shell
// buffer, and the window-chrome delegation contract ("?"/":" type into a
// focused shell instead of opening HelpSearch/Cmdline/Grep).
import { expect, test, type Page } from "../../../../../../common/tests/ui/support/fixtures";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { listDir, renderTree, type FsEntry } from "../../../../../common/lib/shell";

const ROOT = join(import.meta.dirname, "../../../../../..");

// Reboot replays the real (unskippable) boot sequence with real wall-clock
// timers — a MANUAL trigger independent of the boot-seen sessionStorage flag
// this spec's shared `context` fixture pre-seeds (see boot.spec.ts's own "r
// on the ready dashboard replays boot, independent of the session flag").
// The reboot test below installs a fake clock and fast-forwards through it,
// same "install before navigation, runFor to advance" contract every other
// boot-adjacent e2e test in this codebase uses, rather than eating ~5s of
// real time per test run.
const BOOT_MS = 4600;
const HARD_STOP_MS = BOOT_MS + 60;
const OUT_MS = 760;
const CLOCK_TIME = "2026-08-15T23:34:00";

interface ShellYaml {
  homeLabel: string;
  errors: {
    cdNoSuchDirTemplate: string;
    catMissingArgMessage: string;
    vimMissingArgMessage: string;
    vimNoSuchFileTemplate: string;
  };
  sudo: { message: string };
  whoami: string;
  help: { intro: string; rows: { cmd: string; description: string }[] };
  neofetch: { fields: { label: string; value: string }[] };
}

function loadShellYaml(): ShellYaml {
  return YAML.parse(readFileSync(join(ROOT, "src/features/shell-fs/content/shell.yaml"), "utf8")) as ShellYaml;
}

function loadFsIndex(): FsEntry[] {
  const doc = JSON.parse(readFileSync(join(ROOT, "public/generated/fs-index.json"), "utf8")) as {
    entries: FsEntry[];
  };
  return doc.entries;
}

interface RepoFile {
  path: string;
  lines: string[];
}

function loadGrepFiles(): RepoFile[] {
  return JSON.parse(readFileSync(join(ROOT, "public/generated/grep-index.json"), "utf8")) as RepoFile[];
}

function loadRepoFiles(name: string): RepoFile[] {
  const doc = JSON.parse(readFileSync(join(ROOT, `public/generated/repos/${name}.json`), "utf8")) as {
    files: RepoFile[];
  };
  return doc.files;
}

const shellYaml = loadShellYaml();
const fsEntries = loadFsIndex();

async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

const scroller = (page: Page) => page.locator('[data-testid="shell-scroller"]');
const shellInput = (page: Page) => page.locator('[data-testid="shell-input"]');
const shellPrompt = (page: Page) => page.locator('[data-testid="shell-prompt"]');
const statusWindow = (page: Page, id: string) => page.locator(`[data-testid="status-bar-window"][data-window-id="${id}"]`);

/** `:q` from a fresh dashboard load — the shared setup every test below
 * except the relaunch/reboot ones starts from. */
async function dropToShell(page: Page) {
  await gotoReady(page, "/");
  await page.keyboard.press(":");
  await page.keyboard.type("q");
  await page.keyboard.press("Enter");
  await expect(shellPrompt(page)).toBeVisible();
}

async function runInShell(page: Page, line: string) {
  await page.keyboard.type(line);
  await page.keyboard.press("Enter");
}

test.describe("`:q` exits the active pane's program to a shell", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("the shell prompt replaces the dashboard, and the window auto-renames live to zsh", async ({ page }) => {
    await gotoReady(page, "/");
    await expect(statusWindow(page, "dashboard")).toHaveText("0:dashboard*");
    await page.keyboard.press(":");
    await page.keyboard.type("q");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="dashboard-wordmark"]')).not.toBeVisible();
    await expect(shellPrompt(page)).toBeVisible();
    await expect(statusWindow(page, "dashboard")).toHaveText("0:zsh*");
    // URL is frozen — Architecture notes: pushState only for canonical
    // program windows, and "shell" isn't one.
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("typing a bare view name relaunches that program in the pane", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("`dashboard` round-trips the window's auto-rename: dashboard -> zsh -> dashboard", async ({ page }) => {
    await dropToShell(page);
    await expect(statusWindow(page, "dashboard")).toHaveText("0:zsh*");
    await runInShell(page, "dashboard");
    await expect(page.locator('[data-testid="dashboard-wordmark"]')).toBeVisible();
    await expect(statusWindow(page, "dashboard")).toHaveText("0:dashboard*");
  });

  test("`open <view>` launches the same way as the bare name", async ({ page }) => {
    await dropToShell(page);
    await runInShell(page, "open dashboard");
    await expect(page.locator('[data-testid="dashboard-wordmark"]')).toBeVisible();
    await expect(statusWindow(page, "dashboard")).toHaveText("0:dashboard*");
  });
});

test.describe("`exit` builtin ('closes the pane->window cascade')", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("`exit` typed in an ALREADY-shell pane closes the window (distinct from `:q`, which only drops a RUNNING program to a shell)", async ({
    page,
  }) => {
    await gotoReady(page, "/repositories");
    await page.keyboard.press(":");
    await page.keyboard.type("q");
    await page.keyboard.press("Enter");
    await expect(shellPrompt(page)).toBeVisible();

    await runInShell(page, "exit");
    await expect(statusWindow(page, "repositories")).toHaveCount(0);
  });
});

test.describe("manual rename wins over auto-rename", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("a Ctrl-b , renamed window keeps its manual name through `:q` — no auto-rename to zsh", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.down("Control");
    await page.keyboard.press("b");
    await page.keyboard.up("Control");
    await page.keyboard.press(",");
    // The rename prompt is prefilled with the window's CURRENT name
    // ("dashboard") and typed characters append (tmux.spec.ts's own "Ctrl-b
    // , rename-window" suite) — clear it first so the commit is exactly
    // "scratch", not "dashboardscratch".
    for (let i = 0; i < "dashboard".length; i++) await page.keyboard.press("Backspace");
    await page.keyboard.type("scratch");
    await page.keyboard.press("Enter");
    await expect(statusWindow(page, "dashboard")).toHaveText("0:scratch*");

    await page.keyboard.press(":");
    await page.keyboard.type("q");
    await page.keyboard.press("Enter");
    await expect(shellPrompt(page)).toBeVisible();
    await expect(statusWindow(page, "dashboard")).toHaveText("0:scratch*");
  });
});

test.describe("shell builtins", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("pwd/cd: navigates into a real directory and back, matching the real fs-index", async ({ page }) => {
    await dropToShell(page);
    await runInShell(page, "pwd");
    await expect(scroller(page)).toContainText(shellYaml.homeLabel);

    await runInShell(page, "cd src");
    await runInShell(page, "pwd");
    await expect(scroller(page)).toContainText(`${shellYaml.homeLabel}/src`);

    await runInShell(page, "cd nonexistent-dir-xyz");
    await expect(scroller(page)).toContainText(
      shellYaml.errors.cdNoSuchDirTemplate.replace("{path}", "nonexistent-dir-xyz"),
    );
  });

  test("ls: lists the real root directory's entries, directories first", async ({ page }) => {
    await dropToShell(page);
    await runInShell(page, "ls");
    const expected = listDir(fsEntries, []).map((e) => e.name + (e.type === "dir" ? "/" : ""));
    for (const row of expected) {
      await expect(scroller(page)).toContainText(row);
    }
  });

  test("tree: renders the real fs-index as a tree(1)-style listing, rooted at `.`", async ({ page }) => {
    await dropToShell(page);
    await runInShell(page, "tree");
    const expected = renderTree(fsEntries, []);
    await expect(page.locator('[data-testid="shell-line"]', { hasText: "." }).first()).toBeVisible();
    // Spot-check a couple of real rendered rows (connectors included) rather
    // than the whole (potentially long) tree.
    for (const row of expected.slice(1, 3)) {
      await expect(scroller(page)).toContainText(row);
    }
  });

  test("whoami/help/neofetch/sudo print their exact content-driven strings", async ({ page }) => {
    await dropToShell(page);
    await runInShell(page, "whoami");
    await expect(scroller(page)).toContainText(shellYaml.whoami);

    await runInShell(page, "help");
    await expect(scroller(page)).toContainText(shellYaml.help.intro);
    await expect(scroller(page)).toContainText(shellYaml.help.rows[0].cmd);
    await expect(scroller(page)).toContainText(shellYaml.help.rows[0].description);

    await runInShell(page, "neofetch");
    for (const field of shellYaml.neofetch.fields) {
      await expect(scroller(page)).toContainText(`${field.label}: ${field.value}`);
    }
    // Determinism rules: nowMs derives from the same frozen page-clock
    // helper as the session's own createdAt, so under a fast test run the
    // computed uptime is always "0 min" — never a live wall-clock tick.
    await expect(scroller(page)).toContainText("Uptime: 0 min");

    await runInShell(page, "sudo rm -rf /");
    await expect(scroller(page)).toContainText(shellYaml.sudo.message);
  });

  test("cat with no argument reports the missing-operand error", async ({ page }) => {
    await dropToShell(page);
    await runInShell(page, "cat");
    await expect(scroller(page)).toContainText(shellYaml.errors.catMissingArgMessage);
  });

  test("cat package.json prints the real site file content (grep index)", async ({ page }) => {
    await dropToShell(page);
    await runInShell(page, "cat package.json");
    const files = loadGrepFiles();
    const pkg = files.find((f) => f.path === "package.json");
    test.skip(!pkg, "package.json missing from the real grep index");
    await expect(scroller(page)).toContainText(pkg!.lines[0]);
    await expect(scroller(page)).toContainText(pkg!.lines[1]);
  });

  test("cat repos/Sheldon/README.md prints the real repo content (per-repo index)", async ({ page }) => {
    await dropToShell(page);
    await runInShell(page, "cat repos/Sheldon/README.md");
    const files = loadRepoFiles("Sheldon");
    const readme = files.find((f) => f.path === "README.md");
    test.skip(!readme, "Sheldon/README.md missing from the real repo index");
    await expect(scroller(page)).toContainText(readme!.lines[0]);
  });
});

// `vim <file>` (and `vi`/`nvim` aliases) shell builtin: resolves the path
// against the same fs index/content sources `cat` already uses, opens the
// read-only Editor over the shell pane (Repositories/Employment's own `editorFile`
// local-state pattern, reused inside Shell.svelte), and `:q` drops back to
// the shell (never killing the pane).
test.describe("vim / vi / nvim", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("vim package.json opens the real site file read-only, and :q returns to the shell", async ({ page }) => {
    await dropToShell(page);
    await runInShell(page, "vim package.json");
    const files = loadGrepFiles();
    const pkg = files.find((f) => f.path === "package.json");
    test.skip(!pkg, "package.json missing from the real grep index");

    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
    await expect(page.locator('[data-testid="editor-line-text"]').first()).toHaveText(pkg!.lines[0]);
    await expect(shellPrompt(page)).toHaveCount(0);

    await page.keyboard.press(":");
    await page.keyboard.type("q");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="editor-scroller"]')).not.toBeVisible();
    await expect(shellPrompt(page)).toBeVisible();
  });

  test("vi and nvim are accepted aliases for vim", async ({ page }) => {
    await dropToShell(page);
    await runInShell(page, "vi package.json");
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
    await page.keyboard.press(":");
    await page.keyboard.type("q");
    await page.keyboard.press("Enter");
    await expect(shellPrompt(page)).toBeVisible();

    await runInShell(page, "nvim package.json");
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
  });

  test("vim <nonexistent file> reports a vim-style error line and stays in the shell", async ({ page }) => {
    await dropToShell(page);
    await runInShell(page, "vim nonexistent-file-xyz.md");
    await expect(scroller(page)).toContainText(
      shellYaml.errors.vimNoSuchFileTemplate.replace("{path}", "nonexistent-file-xyz.md"),
    );
    await expect(page.locator('[data-testid="editor-scroller"]')).toHaveCount(0);
    await expect(shellPrompt(page)).toBeVisible();
  });

  test("bare vim (no argument) reports a usage error", async ({ page }) => {
    await dropToShell(page);
    await runInShell(page, "vim");
    await expect(scroller(page)).toContainText(shellYaml.errors.vimMissingArgMessage);
    await expect(page.locator('[data-testid="editor-scroller"]')).toHaveCount(0);
  });
});

test.describe("shell history (Up/Down arrows)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("Up recalls the most recent command first, then older ones; Down walks back to the empty draft", async ({
    page,
  }) => {
    await dropToShell(page);
    await runInShell(page, "whoami");
    // Waits for the FIRST command's own (async — it warms the fs-index
    // cache) output before submitting the second: `runCommand` only ever
    // appends "whoami" to `pane.shell.history` once that resolves, so
    // pressing Up before it lands would still see an empty history.
    await expect(scroller(page)).toContainText(shellYaml.whoami);
    await runInShell(page, "help");
    await expect(scroller(page)).toContainText(shellYaml.help.intro);

    await page.keyboard.press("ArrowUp");
    await expect(shellInput(page)).toHaveText("help");

    await page.keyboard.press("ArrowUp");
    await expect(shellInput(page)).toHaveText("whoami");

    await page.keyboard.press("ArrowDown");
    await expect(shellInput(page)).toHaveText("help");

    await page.keyboard.press("ArrowDown");
    await expect(shellInput(page)).toHaveText("");
  });
});

test.describe("reboot factory-resets the tmux client AND every pane's shell state", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("reboot restores the 6 factory windows (names reset) and clears the shelled pane's own scrollback", async ({
    page,
  }) => {
    await page.clock.install({ time: CLOCK_TIME });
    await dropToShell(page);
    await runInShell(page, "whoami");
    await expect(scroller(page)).toContainText(shellYaml.whoami);
    await expect(statusWindow(page, "dashboard")).toHaveText("0:zsh*");

    await page.locator('[data-testid="status-bar-reboot"]').click();
    await expect(page.locator('[data-testid="boot-sequence"]')).toBeVisible();
    await page.clock.runFor(HARD_STOP_MS + OUT_MS + 100);
    await expect(page.locator('[data-testid="boot-sequence"]')).toHaveCount(0);

    // Factory state: 6 windows, back to their canonical names, dashboard
    // active — same shape createFactoryClient() seeds on first page load.
    await expect(page.locator('[data-testid="status-bar-window"]')).toHaveCount(6);
    await expect(statusWindow(page, "dashboard")).toHaveText("0:dashboard*");
    await expect(page.locator('[data-testid="dashboard-wordmark"]')).toBeVisible();

    // The dashboard pane's shell buffer is gone too, not just the window's
    // program/name — dropping to a shell again shows an EMPTY scrollback,
    // not the pre-reboot "whoami" output surviving underneath.
    await page.keyboard.press(":");
    await page.keyboard.type("q");
    await page.keyboard.press("Enter");
    await expect(shellPrompt(page)).toBeVisible();
    await expect(page.locator('[data-testid="shell-line"]')).toHaveCount(0);
  });

  // The old amber toast system's "reboot clears in-memory dismissals" case
  // is retired along with it — see src/features/notifications/tests/ui/e2e/notifications.spec.ts's own
  // reboot-closes-the-panel coverage for the Mockup-B replacement.
});

test.describe("window-chrome delegation: a focused shell owns `?`/`:`/`/`", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("`?` types into the shell instead of opening the HelpSearch palette", async ({ page }) => {
    await dropToShell(page);
    await page.keyboard.press("?");
    await expect(page.locator('[data-testid="help-search-overlay"]')).not.toBeVisible();
    await expect(shellInput(page)).toHaveText("?");
  });

  test("`:` types into the shell instead of opening the Cmdline box", async ({ page }) => {
    await dropToShell(page);
    await page.keyboard.press(":");
    await expect(page.locator('[data-testid="cmdline-overlay"]')).not.toBeVisible();
    await expect(shellInput(page)).toHaveText(":");
  });

  test("`/` types into the shell instead of opening the grep overlay", async ({ page }) => {
    await dropToShell(page);
    await page.keyboard.press("/");
    await expect(page.locator('[data-testid="grep-overlay"]')).not.toBeVisible();
    await expect(shellInput(page)).toHaveText("/");
  });
});

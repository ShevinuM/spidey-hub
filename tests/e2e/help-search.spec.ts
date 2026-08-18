// Behavioral e2e suite for the site-wide `?` fuzzy HelpSearch palette
// (PLAN.md Iteration 3 Phase 3 item 3.3) — src/components/HelpSearch.svelte,
// driven by Terminal.svelte. Covers: opening from multiple contexts, the
// gating rules (Locked decision #14 — editor/grep/Cmdline/status-bar
// prompt/boot all block it), the empty-query command listing, fuzzy
// filtering + fuzzy canaries mirroring the pure unit-test canaries in
// tests/unit/helpSearch.test.ts, Enter's two behaviors (executes a command,
// no-ops on a keymap row), Esc, and window-chrome close-on-switch. The
// sibling Cmdline suite (cmdline.spec.ts) covers the regression that `?`
// still types literally into an already-open grep query / Cmdline input.
import { expect, test, type Page } from "./fixtures.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

const ROOT = join(import.meta.dirname, "../..");

interface CmdlineCommandDef {
  name: string;
  description: string;
  action?: string;
}
interface CmdlineYaml {
  commands: CmdlineCommandDef[];
}

function loadCommands(): CmdlineCommandDef[] {
  const doc = YAML.parse(readFileSync(join(ROOT, "src/data/cmdline.yaml"), "utf8")) as CmdlineYaml;
  return doc.commands.filter((c) => c.name !== "q");
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

const overlay = (page: Page) => page.locator('[data-testid="help-search-overlay"]');
const input = (page: Page) => page.locator('[data-testid="help-search-input"]');
const results = (page: Page) => page.locator('[data-testid="help-search-result"]');

test.describe("HelpSearch: opening (Locked decision #14)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  for (const path of ["/", "/builds", "/personnel", "/retina-v", "/profile", "/help"]) {
    test(`? opens the palette from ${path}`, async ({ page }) => {
      await gotoReady(page, path);
      await page.keyboard.press("?");
      await expect(overlay(page)).toBeVisible();
      await expect(input(page)).toHaveText("▌");
    });
  }

  test("Esc closes the palette with no navigation", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("?");
    await expect(overlay(page)).toBeVisible();
    await page.keyboard.type("builds");
    await page.keyboard.press("Escape");
    await expect(overlay(page)).not.toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("a status-bar window switch closes the palette (window-chrome contract)", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("?");
    await expect(overlay(page)).toBeVisible();
    await page.locator('[data-testid="status-bar-window"][data-window-id="builds"]').click();
    await expect(overlay(page)).not.toBeVisible();
    await expect(page).toHaveURL(/\/builds$/);
  });

  test("clicking the status-bar ↻ reboot control closes the palette (window-chrome contract)", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("?");
    await expect(overlay(page)).toBeVisible();
    // The palette owns the keyboard while open (see the gating suite below
    // — even `r` just types into its query), so reboot has to be triggered
    // by mouse here, exactly like a real user would from this state.
    await page.locator('[data-testid="status-bar-reboot"]').click();
    await expect(overlay(page)).not.toBeVisible();
    await expect(page.locator('[data-testid="boot-sequence"]')).toBeVisible();
  });
});

test.describe("HelpSearch: gating — does NOT open in these contexts", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("does not open while a file editor is open", async ({ page }) => {
    await gotoReady(page, "/builds");
    await page.keyboard.press("3");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="builds-tree-row"][data-entry-name="README.md"]')).toBeVisible();
    await page.locator('[data-testid="builds-tree-row"][data-entry-name="README.md"]').click();
    await page.keyboard.press("2");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();

    await page.keyboard.press("?");
    await expect(overlay(page)).not.toBeVisible();
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
  });

  test("does not open while grep is open — ? types literally into the grep query instead (regression)", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    await expect(page.locator('[data-testid="grep-overlay"]')).toBeVisible();
    await page.keyboard.press("?");
    await expect(page.locator('[data-testid="grep-query"]')).toContainText("?");
    await expect(overlay(page)).not.toBeVisible();
  });

  test("does not open while Cmdline is open — ? types literally into the Cmdline input instead (regression)", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await page.keyboard.press(":");
    await expect(page.locator('[data-testid="cmdline-overlay"]')).toBeVisible();
    await page.keyboard.press("?");
    await expect(page.locator('[data-testid="cmdline-input"]')).toContainText("?");
    await expect(overlay(page)).not.toBeVisible();
  });

  test("does not open during a status-bar rename prompt", async ({ page }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    await page.keyboard.press(",");
    await expect(page.locator('[data-testid="status-prompt"]')).toBeVisible();
    await page.keyboard.press("?");
    await expect(overlay(page)).not.toBeVisible();
    await expect(page.locator('[data-testid="status-prompt"]')).toBeVisible();
  });

  test("? still types inside the already-open palette itself (it's a text input, not a toggle)", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("?");
    await expect(overlay(page)).toBeVisible();
    await page.keyboard.press("?");
    await expect(input(page)).toContainText("?");
    await expect(overlay(page)).toBeVisible();
  });
});

test.describe("HelpSearch: empty-query listing + fuzzy filtering", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("empty query lists the site-wide commands, minus q", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("?");
    const commands = loadCommands();
    await expect(results(page)).toHaveCount(commands.length);
    for (const c of commands) {
      await expect(page.locator(`[data-testid="help-search-result"][data-label="${c.name}"]`)).toBeVisible();
    }
    await expect(page.locator('[data-testid="help-search-result"][data-label="q"]')).toHaveCount(0);
  });

  test("typing filters the results down from the full empty-query list", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("?");
    await page.keyboard.type("reboot");
    // An exact match on the "reboot" command ranks first (PLAN.md 3.3
    // scoring cascade); other rows whose DESCRIPTION merely mentions the
    // word "reboot" (e.g. the Global section's own "r" keymap row) can
    // still trail behind it (results are capped at 10), so the only thing
    // asserted here is the top result and that an unrelated command from
    // the empty-query listing (e.g. "profile") no longer appears at all.
    await expect(results(page).first()).toHaveAttribute("data-label", "reboot");
    await expect(results(page).first()).toHaveAttribute("data-kind", "command");
    await expect(page.locator('[data-testid="help-search-result"][data-label="profile"]')).toHaveCount(0);
  });

  test('fuzzy canary: "kil" surfaces both the kill-window and kill-pane keymap rows', async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("?");
    await page.keyboard.type("kil");
    await expect(results(page).filter({ hasText: "kill-window" })).not.toHaveCount(0);
    await expect(results(page).filter({ hasText: "kill-pane" })).not.toHaveCount(0);
  });

  test('fuzzy canary: "dash" ranks the dashboard command first', async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("?");
    await page.keyboard.type("dash");
    await expect(results(page).first()).toHaveAttribute("data-label", "dashboard");
    await expect(results(page).first()).toHaveAttribute("data-kind", "command");
  });

  test('fuzzy canary: "rbt" subsequence-matches reboot', async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("?");
    await page.keyboard.type("rbt");
    await expect(results(page).first()).toHaveAttribute("data-label", "reboot");
  });
});

test.describe("HelpSearch: Enter behavior", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("Enter on a command row (builds) executes it and closes the palette", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("?");
    await page.keyboard.type("builds");
    await page.keyboard.press("Enter");
    await expect(overlay(page)).not.toBeVisible();
    await expect(page).toHaveURL(/\/builds$/);
  });

  test("Enter on a keymap row no-ops — the palette stays open, nothing navigates", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("?");
    await page.keyboard.type("kil");
    // Every result for "kil" is a keymap row (no command name/description
    // contains it — see tests/unit/helpSearch.test.ts's own canary), so the
    // top (default-selected) row is guaranteed to be one.
    await expect(results(page).first()).toHaveAttribute("data-kind", "keymap");
    await page.keyboard.press("Enter");
    await expect(overlay(page)).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });
});

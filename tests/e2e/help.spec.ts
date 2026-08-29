// Behavioral e2e suite for the Help window — the sixth status-bar window
// ("5:help"), reachable via `Ctrl-b ?`, `Ctrl-b 5`, a status-bar click, and
// the dashboard menu's Help row (its hotkey column shows the live `Ctrl-b 5`
// binding, not a bare letter — there is no bare-key dashboard hotkey; a bare
// `?` opens the site-wide HelpSearch palette instead, see
// tests/e2e/help-search.spec.ts). Content is asserted against the real
// src/data/help.yaml chrome + src/content/help/*.md scopes (read directly,
// same pattern as grep.spec.ts's real-index comparisons) so this suite can
// never drift from the actual copy.
import { expect, test, type Page } from "../../common/tests/ui/support/fixtures.ts";
// This spec's `context` fixture (imported from ./fixtures.ts, not raw
// "@playwright/test") pre-seeds the boot-seen sessionStorage flag before
// every navigation, so BootSequence.svelte's unskippable sequence never
// runs for these tests.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { readContentDir } from "../../common/tests/ui/support/content-fixtures.ts";

const ROOT = join(import.meta.dirname, "../..");

interface HelpRow {
  name: string;
  desc: string;
  keys: string[];
}
interface HelpScope {
  id: string;
  label: string;
  hint: string;
  rows: HelpRow[];
}
interface HelpChrome {
  title: string;
  filterPlaceholder: string;
  allScopeLabel: string;
  emptyStateText: string;
  legend: string[];
}
interface HelpData extends HelpChrome {
  scopes: HelpScope[];
}
interface HelpScopeFrontmatter {
  label: string;
  hint: string;
  order: number;
  rows: HelpRow[];
}

function realHelp(): HelpData {
  const chrome = YAML.parse(readFileSync(join(ROOT, "src/data/help.yaml"), "utf8")) as HelpChrome;
  const entries = readContentDir<HelpScopeFrontmatter>(join(ROOT, "src/content/help"));
  const scopes = entries
    .slice()
    .sort((a, b) => a.data.order - b.data.order)
    .map((e) => ({ id: e.id, label: e.data.label, hint: e.data.hint, rows: e.data.rows }));
  return { ...chrome, scopes };
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

const scroller = (page: Page) => page.locator('[data-testid="help-scroller"]');
const rows = (page: Page) => page.locator('[data-testid="help-row"]');
const scopeTabs = (page: Page) => page.locator('[data-testid="help-scope-tab"]');
const filterBox = (page: Page) => page.locator('[data-testid="help-filter-box"]');
const matchCount = (page: Page) => page.locator('[data-testid="help-match-count"]');

test.describe("Help: reachability", () => {
  test("Ctrl-b ? opens help (tmux list-keys style)", async ({ page }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    await page.keyboard.press("?");
    await expect(page).toHaveURL(/\/help$/);
    await expect(scroller(page)).toBeVisible();
  });

  test("Ctrl-b 5 opens help", async ({ page }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    await page.keyboard.press("5");
    await expect(page).toHaveURL(/\/help$/);
  });

  test("the dashboard's Help menu row shows its real tmux binding (Ctrl-b 5)", async ({ page }) => {
    await gotoReady(page, "/");
    const row = page.locator('[data-testid="dashboard-menu-row"][data-menu-id="help"]');
    await expect(row).toContainText("C-b 5");
  });

  test("clicking the 5:help status-bar window opens help", async ({ page }) => {
    await gotoReady(page, "/repositories");
    await page.locator('[data-testid="status-bar-window"][data-window-id="help"]').click();
    await expect(page).toHaveURL(/\/help$/);
  });

  test("clicking the dashboard's Help menu row opens help", async ({ page }) => {
    await gotoReady(page, "/");
    await page.locator('[data-testid="dashboard-menu-row"][data-menu-id="help"]').click();
    await expect(page).toHaveURL(/\/help$/);
  });
});

test.describe("Help: content is sourced from src/data/help.yaml + src/content/help", () => {
  test("title and total row count match the real file", async ({ page }) => {
    await gotoReady(page, "/help");
    const help = realHelp();

    await expect(page.locator('[data-testid="help-title"]')).toHaveText(help.title);

    const totalRows = help.scopes.reduce((n, s) => n + s.rows.length, 0);
    await expect(rows(page)).toHaveCount(totalRows);
    await expect(matchCount(page)).toContainText(`${totalRows} shown`);

    // Spot-check the first scope's first row renders the exact yaml text.
    const firstRow = help.scopes[0].rows[0];
    await expect(rows(page).first()).toContainText(firstRow.name);
    await expect(rows(page).first()).toContainText(firstRow.desc);
  });

  test("the sidebar lists 'All bindings' plus one tab per scope, with matching counts", async ({ page }) => {
    await gotoReady(page, "/help");
    const help = realHelp();
    const totalRows = help.scopes.reduce((n, s) => n + s.rows.length, 0);

    await expect(scopeTabs(page)).toHaveCount(help.scopes.length + 1);
    await expect(scopeTabs(page).first()).toContainText(help.allScopeLabel);
    await expect(scopeTabs(page).first()).toContainText(String(totalRows));

    const secondScope = help.scopes[1];
    const secondTab = page.locator(`[data-testid="help-scope-tab"][data-scope-id="${secondScope.id}"]`);
    await expect(secondTab).toContainText(secondScope.label);
    await expect(secondTab).toContainText(String(secondScope.rows.length));
  });

  test("clicking a scope tab narrows the list to just that scope's rows", async ({ page }) => {
    await gotoReady(page, "/help");
    const help = realHelp();
    const target = help.scopes.find((s) => s.id === "repositories")!;

    await page.locator('[data-testid="help-scope-tab"][data-scope-id="repositories"]').click();
    await expect(rows(page)).toHaveCount(target.rows.length);
    await expect(matchCount(page)).toContainText(`${target.rows.length} shown`);
    for (const row of target.rows) {
      await expect(rows(page).filter({ hasText: row.name })).not.toHaveCount(0);
    }
  });

  test("the previously-undocumented Profile `r` resume key is listed", async ({ page }) => {
    await gotoReady(page, "/help");
    const help = realHelp();
    const hasR = help.scopes.some((s) => s.rows.some((r) => r.keys.includes("r") && /résumé/i.test(r.desc)));
    expect(hasR).toBe(true);
    await expect(page.locator('[data-testid="help-row"]', { hasText: "PDF" })).toBeVisible();
  });
});

test.describe("Help: filter", () => {
  test("clicking the filter box focuses it and shows a blinking cursor", async ({ page }) => {
    await gotoReady(page, "/help");
    await filterBox(page).click();
    await expect(page.locator('[data-testid="help-filter-cursor"]')).toBeVisible();
  });

  test("typing filters rows by name/description/keys and updates the shown count", async ({ page }) => {
    await gotoReady(page, "/help");
    const before = await rows(page).count();

    await filterBox(page).click();
    await page.keyboard.type("kill-window");

    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("kill-window");
    const count = await rows(page).count();
    expect(count).toBeLessThan(before);
    await expect(matchCount(page)).toContainText(`${count} shown`);
  });

  test("a filter with no matches shows the empty state", async ({ page }) => {
    await gotoReady(page, "/help");
    await filterBox(page).click();
    await page.keyboard.type("zzzznotarealbinding");
    await expect(page.locator('[data-testid="help-empty"]')).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
  });

  test("Esc blurs the filter but keeps the typed text and the narrowed list", async ({ page }) => {
    await gotoReady(page, "/help");
    await filterBox(page).click();
    await page.keyboard.type("reboot");
    const filtered = await rows(page).count();

    await page.keyboard.press("Escape");

    await expect(page.locator('[data-testid="help-filter-cursor"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="help-filter-text"]')).toHaveText("reboot");
    await expect(rows(page)).toHaveCount(filtered);
  });

  test("while the filter is focused, r/`/`/`?` type into the query instead of rebooting/opening grep/opening the command search", async ({
    page,
  }) => {
    await gotoReady(page, "/help");
    await filterBox(page).click();
    await page.keyboard.press("r");
    await page.keyboard.press("/");
    await page.keyboard.press("?");

    await expect(page.locator('[data-testid="help-filter-text"]')).toHaveText("r/?");
    await expect(page.locator('[data-testid="boot-sequence"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="grep-overlay"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="help-search-overlay"]')).not.toBeVisible();
  });

  test("while the filter is NOT focused, a bare r still reboots", async ({ page }) => {
    await gotoReady(page, "/help");
    await page.keyboard.press("r");
    await expect(page.locator('[data-testid="boot-sequence"]')).toBeVisible();
  });
});

test.describe("Help: scrolling", () => {
  test("arrow keys scroll the list when the filter isn't focused", async ({ page }) => {
    await gotoReady(page, "/help");
    await expect(scroller(page)).toBeVisible();

    // The full keymap table overflows any of this suite's viewports, so a
    // handful of "ArrowDown" presses is enough to move scrollTop off zero
    // regardless of exact row/section pixel heights.
    const before = await scroller(page).evaluate((el) => el.scrollTop);
    for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowDown");
    const afterDown = await scroller(page).evaluate((el) => el.scrollTop);
    expect(afterDown).toBeGreaterThan(before);

    for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowUp");
    const afterUp = await scroller(page).evaluate((el) => el.scrollTop);
    expect(afterUp).toBeLessThan(afterDown);
  });
});

test.describe("Help: status bar", () => {
  test("status bar shows windows 0-5 with help active", async ({ page }) => {
    await gotoReady(page, "/help");
    const text = (await page.locator('[data-testid="status-bar-windows"]').innerText())
      .replace(/\s+/g, " ")
      .trim();
    expect(text).toBe("0:dashboard 1:repos 2:employment 3:retina-v 4:profile 5:help*");
  });
});

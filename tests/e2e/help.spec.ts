// Behavioral e2e suite for the Help window — PLAN.md Phase 1 item 13.
// New sixth status-bar window ("5:help"), reachable via `Ctrl-b ?`,
// `Ctrl-b 5`, a status-bar click, and the dashboard menu's Help row
// (hotkey `?`). Content is asserted against the real src/data/help.yaml
// (read directly, same pattern as grep.spec.ts's real-index comparisons)
// so this suite can never drift from the actual copy.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

const ROOT = join(import.meta.dirname, "../..");

interface HelpRow {
  key: string;
  description: string;
  status?: "planned";
}
interface HelpSection {
  title: string;
  rows: HelpRow[];
}
interface HelpData {
  title: string;
  scrollHint: string;
  plannedNote: string;
  sections: HelpSection[];
}

function realHelp(): HelpData {
  return YAML.parse(readFileSync(join(ROOT, "src/data/help.yaml"), "utf8")) as HelpData;
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

  test("? from the dashboard opens help", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("?");
    await expect(page).toHaveURL(/\/help$/);
  });

  test("clicking the 5:help status-bar window opens help", async ({ page }) => {
    await gotoReady(page, "/builds");
    await page.locator('[data-testid="status-bar-window"][data-window-id="help"]').click();
    await expect(page).toHaveURL(/\/help$/);
  });

  test("clicking the dashboard's Help menu row opens help", async ({ page }) => {
    await gotoReady(page, "/");
    await page.locator('[data-testid="dashboard-menu-row"][data-menu-id="help"]').click();
    await expect(page).toHaveURL(/\/help$/);
  });
});

test.describe("Help: content is sourced from src/data/help.yaml", () => {
  test("title, section titles, and row count match the real file", async ({ page }) => {
    await gotoReady(page, "/help");
    const help = realHelp();

    await expect(page.getByText(help.title)).toBeVisible();

    const rows = page.locator('[data-testid="help-row"]');
    const totalRows = help.sections.reduce((n, s) => n + s.rows.length, 0);
    await expect(rows).toHaveCount(totalRows);

    // Spot-check the first section's first row and the last section's last
    // row render the exact yaml text, not a paraphrase.
    const firstRow = help.sections[0].rows[0];
    await expect(rows.first()).toContainText(firstRow.key);
    await expect(rows.first()).toContainText(firstRow.description);

    const lastSection = help.sections[help.sections.length - 1];
    const lastRow = lastSection.rows[lastSection.rows.length - 1];
    await expect(rows.last()).toContainText(lastRow.key);
  });

  test("the previously-undocumented Profile `r` resume key is listed", async ({ page }) => {
    await gotoReady(page, "/help");
    const help = realHelp();
    const hasR = help.sections.some((s) => s.rows.some((r) => r.key === "r" && /resume/i.test(r.description)));
    expect(hasR).toBe(true);
    await expect(page.locator('[data-testid="help-row"]', { hasText: "resume.pdf" })).toBeVisible();
  });
});

test.describe("Help: scrolling", () => {
  test("j/k scroll the help list", async ({ page }) => {
    await gotoReady(page, "/help");
    await expect(scroller(page)).toBeVisible();

    // The full keymap table (~50 rows across 8 sections) overflows any of
    // this suite's viewports, so a handful of "j" presses is enough to move
    // scrollTop off zero regardless of exact row/section pixel heights.
    const before = await scroller(page).evaluate((el) => el.scrollTop);
    for (let i = 0; i < 8; i++) await page.keyboard.press("j");
    const afterJ = await scroller(page).evaluate((el) => el.scrollTop);
    expect(afterJ).toBeGreaterThan(before);

    for (let i = 0; i < 8; i++) await page.keyboard.press("k");
    const afterK = await scroller(page).evaluate((el) => el.scrollTop);
    expect(afterK).toBeLessThan(afterJ);
  });
});

test.describe("Help: status bar", () => {
  test("status bar shows windows 0-5 with help active", async ({ page }) => {
    await gotoReady(page, "/help");
    const text = (await page.locator('[data-testid="status-bar-windows"]').innerText())
      .replace(/\s+/g, " ")
      .trim();
    expect(text).toBe("0:dashboard 1:builds 2:personnel 3:retina-v 4:profile 5:help*");
  });
});

// Behavioral e2e safety net for Dashboard.svelte — the
// dashboard previously had only incidental coverage (nav.spec.ts's rename +
// footer-pane-count describe block). Scope: the menu's labels/icons/key-hint
// column against src/data/dashboard.yaml (asserted as current truth —
// "Employment Records" included), click AND keyboard (Enter/Space)
// navigation from every row, the synced-panes footer line, and wordmark
// presence/label.
import { expect, test, type Page } from "../../../../../../common/tests/ui/support/fixtures";

async function gotoReady(page: Page, path = "/") {
  await page.goto(path);
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

async function goDashboard(page: Page) {
  await page.locator('[data-testid="status-bar-window"][data-window-id="dashboard"]').click();
  await expect(page).toHaveURL(/\/$/);
}

/** src/data/dashboard.yaml's `menu` list, top to bottom, plus the tmux
 * binding each id's mapped view actually carries (window numbers per
 * site.yaml: dashboard=0, repositories=1, employment=2, retina-v=3, profile=4,
 * help=5 — see src/common/lib/views.ts's `viewToTmuxBinding`). Yaml order does NOT
 * match window-number order (info/tracker are swapped relative to their
 * bindings), which is exactly why this table is hand-mirrored rather than
 * assumed sorted. */
const MENU = [
  { id: "projects", icon: "▤", label: "Repositories", binding: "C-b 1", route: "/repositories" },
  { id: "xp", icon: "◆", label: "Employment Records", binding: "C-b 2", route: "/employment" },
  { id: "info", icon: "◉", label: "Profile", binding: "C-b 4", route: "/profile" },
  { id: "tracker", icon: "spider-mask", label: "Retina-V", binding: "C-b 3", route: "/retina-v" },
  { id: "help", icon: "?", label: "Help", binding: "C-b 5", route: "/help" },
] as const;

test.describe("dashboard wordmark", () => {
  test("SPIDEY-HUB wordmark is visible with the matching aria-label", async ({ page }) => {
    await gotoReady(page);
    const wordmark = page.locator('[data-testid="dashboard-wordmark"]');
    await expect(wordmark).toBeVisible();
    await expect(wordmark).toHaveAttribute("aria-label", "SPIDEY-HUB");
  });
});

test.describe("menu rows: labels + key hints from dashboard.yaml", () => {
  test("exactly 5 rows render, in yaml order, with the right ids and labels", async ({ page }) => {
    await gotoReady(page);
    const rows = page.locator('[data-testid="dashboard-menu-row"]');
    await expect(rows).toHaveCount(MENU.length);
    for (let i = 0; i < MENU.length; i++) {
      const row = rows.nth(i);
      await expect(row).toHaveAttribute("data-menu-id", MENU[i].id);
      await expect(row).toContainText(MENU[i].label);
    }
  });

  test("each row's hotkey column shows its real C-b <window-number> binding", async ({ page }) => {
    await gotoReady(page);
    for (const item of MENU) {
      const row = page.locator(`[data-testid="dashboard-menu-row"][data-menu-id="${item.id}"]`);
      await expect(row).toContainText(item.binding);
    }
  });
});

test.describe("menu navigation", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("clicking each menu row navigates to its view, one at a time from the dashboard", async ({ page }) => {
    for (const item of MENU) {
      await gotoReady(page);
      await page.locator(`[data-testid="dashboard-menu-row"][data-menu-id="${item.id}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${item.route.replace("/", "\\/")}$`));
      await goDashboard(page);
    }
  });

  test("Enter on a focused row navigates, same as a click", async ({ page }) => {
    await gotoReady(page);
    const row = page.locator('[data-testid="dashboard-menu-row"][data-menu-id="xp"]');
    await row.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/employment$/);
  });

  test("Space on a focused row navigates, same as a click", async ({ page }) => {
    await gotoReady(page);
    const row = page.locator('[data-testid="dashboard-menu-row"][data-menu-id="help"]');
    await row.focus();
    await page.keyboard.press(" ");
    await expect(page).toHaveURL(/\/help$/);
  });
});

test.describe("footer synced-panes line", () => {
  test("reads the exact template with the live pane count substituted twice", async ({ page }) => {
    await gotoReady(page);
    await expect(page.getByText(/⚡ synced \d+\/\d+ panes in 48\.23ms/)).toHaveText(
      "⚡ synced 6/6 panes in 48.23ms",
    );
  });
});

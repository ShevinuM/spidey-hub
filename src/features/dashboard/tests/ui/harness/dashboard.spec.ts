// Proves Dashboard.svelte renders standalone (wordmark, menu rows, footer
// line, no kernel chrome) at `/harness/dashboard`; does not assert row
// navigation, since Terminal.svelte owns that in the real app (its
// `paneLeaf` snippet's onSelect wiring).
import { expect, test } from "@playwright/test";
import { DashboardPage } from "../pages/DashboardPage";

// Hand-mirrored from src/features/dashboard/content/dashboard.yaml — yaml
// order, not window-number order — since Playwright specs can't import a
// .yaml file at runtime (Vite-only `?raw` imports aren't available here).
const MENU = [
  { id: "projects", icon: "▤", label: "Repositories", binding: "C-b 1" },
  { id: "xp", icon: "◆", label: "Employment Records", binding: "C-b 2" },
  { id: "info", icon: "◉", label: "Profile", binding: "C-b 4" },
  { id: "tracker", icon: "spider-mask", label: "Retina-V", binding: "C-b 3" },
  { id: "help", icon: "?", label: "Help", binding: "C-b 5" },
] as const;

test.describe("Dashboard harness: mounts standalone with seeded fixture props", () => {
  test("the SPIDEY-HUB wordmark renders with its aria-label — no kernel required", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.openHarness();

    await expect(dashboard.wordmark).toBeVisible();
    await expect(dashboard.wordmark).toHaveAttribute("aria-label", "SPIDEY-HUB");
  });

  test("all 5 menu rows render, in yaml order, with their real labels/icons and synthetic hotkey bindings", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.openHarness();

    await expect(dashboard.menuRows).toHaveCount(MENU.length);
    for (let i = 0; i < MENU.length; i++) {
      const row = dashboard.menuRows.nth(i);
      await expect(row).toHaveAttribute("data-menu-id", MENU[i].id);
      await expect(row).toContainText(MENU[i].label);
      await expect(row).toContainText(MENU[i].binding);
      // "spider-mask" isn't a text glyph — it renders as a CSS-masked span
      // with no text content (Dashboard.svelte's own `{#if item.icon ===
      // "spider-mask"}` branch), so it has nothing to assert via
      // `toContainText`; its pixels are exactly what the `01-dashboard`
      // golden already locks.
      if (MENU[i].icon !== "spider-mask") {
        await expect(row).toContainText(MENU[i].icon);
      }
    }
  });

  test("the footer sync line interpolates the synthetic paneCount (6/6)", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.openHarness();

    await expect(dashboard.footerSyncLine).toHaveText("⚡ synced 6/6 panes in 48.23ms");
  });

  test("no Terminal kernel chrome mounts alongside it (no status bar, no window switching)", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.openHarness();

    await expect(dashboard.statusBar.windows).toHaveCount(0);
  });
});

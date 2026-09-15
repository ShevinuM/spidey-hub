// Harness spec: proves HelpView.svelte + HelpSearch.svelte work standalone,
// driven by HelpHarness.svelte's own keydown routing rather than Terminal's,
// so it covers only the feature's own core interactions — never kernel-only
// chrome or hotkeys.
import { expect, test } from "@playwright/test";
import { HelpPage } from "../pages/HelpPage";

test.describe("Help harness: mounts standalone with seeded fixture props", () => {
  test("renders the help title and keymap rows from real content — no kernel required", async ({
    page,
  }) => {
    const help = new HelpPage(page);
    await help.openHarness();

    await expect(help.title).toHaveText("Need some help?");
    await expect(help.rows.first()).toBeVisible();

    // At least "All bindings" plus one real scope tab — a web-first proof
    // (nth(1) resolving/visible) rather than a once-read count, since a
    // fresh mount's tab list can still be settling.
    await expect(help.scopeTabs.nth(1)).toBeVisible();
  });

  test("? opens the search palette via the harness's own keydown routing", async ({ page }) => {
    const help = new HelpPage(page);
    await help.openHarness();

    await help.openSearch();
    await expect(help.searchOverlay).toBeVisible();
    await expect(help.searchInput).toBeVisible();
  });

  test('fuzzy canary: "kil" surfaces both the kill-window and kill-pane keymap rows', async ({
    page,
  }) => {
    const help = new HelpPage(page);
    await help.openHarness();

    await help.openSearch();
    await page.keyboard.type("kil");
    await expect(help.searchResults.filter({ hasText: "kill-window" })).not.toHaveCount(0);
    await expect(help.searchResults.filter({ hasText: "kill-pane" })).not.toHaveCount(0);
  });

  test("Enter on a keymap row no-ops — the palette stays open, nothing navigates", async ({
    page,
  }) => {
    const help = new HelpPage(page);
    await help.openHarness();

    await help.openSearch();
    await page.keyboard.type("kil");
    await expect(help.searchResults.first()).toHaveAttribute("data-kind", "keymap");
    await page.keyboard.press("Enter");
    await expect(help.searchOverlay).toBeVisible();
  });

  test("Enter on a command row resolves the action and closes the palette", async ({ page }) => {
    const help = new HelpPage(page);
    await help.openHarness();

    await help.openSearch();
    await page.keyboard.type("reboot");
    await expect(help.searchResults.first()).toHaveAttribute("data-kind", "command");
    await page.keyboard.press("Enter");
    await expect(help.searchOverlay).not.toBeVisible();
    await expect(help.lastExecuted).toHaveText(/.+/);
  });

  test("Esc closes the search palette", async ({ page }) => {
    const help = new HelpPage(page);
    await help.openHarness();

    await help.openSearch();
    await expect(help.searchOverlay).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(help.searchOverlay).not.toBeVisible();
  });

  test("no Terminal kernel chrome mounts alongside it (no status bar, no window switching)", async ({
    page,
  }) => {
    const help = new HelpPage(page);
    await help.openHarness();
    await expect(help.statusBar.windows).toHaveCount(0);
  });
});

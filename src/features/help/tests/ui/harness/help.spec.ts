// Harness spec — proves the help feature's own two pieces (HelpView.svelte's
// keymap reference, HelpSearch.svelte's `?` fuzzy palette) work mounted
// together, standalone (no Terminal kernel, no tmux chrome, no window
// switching), against `/harness/help` (fixture build only, seeded fixture
// props). Both pieces are composed here by `HelpHarness.svelte` (this same
// folder) rather than Terminal — its own minimal keydown routing (not
// Terminal's fuller delegation) is what makes `?` reachable at all in this
// mount, so asserting it here is proving the harness's own wiring, not a
// kernel-only hotkey (e2e-testing.md R018's exclusion covers the latter,
// not this).
//
// Deliberately NOT a copy of src/features/help/tests/ui/e2e/help*.spec.ts:
// those suites exercise help through the real kernel (window switching,
// status-bar reachability, tmux prefix gating against grep/Cmdline/editor —
// none of which exist here). This spec covers mount + the feature's own
// core interactions: keymap content rendering, opening the search palette,
// its fuzzy canary, Enter's no-op on a keymap row, Esc, and the absence of
// kernel chrome.
import { expect, test } from "@playwright/test";
import { HelpPage } from "../pages/HelpPage";

test.describe("Help harness: mounts standalone with seeded fixture props", () => {
  test("renders the help title and keymap rows from real content — no kernel required", async ({ page }) => {
    const help = new HelpPage(page);
    await help.openHarness();

    await expect(help.title).toHaveText("Need some help?");
    await expect(help.rows.first()).toBeVisible();
    const rowCount = await help.rows.count();
    expect(rowCount).toBeGreaterThan(0);

    const tabCount = await help.scopeTabs.count();
    expect(tabCount).toBeGreaterThan(1); // "All bindings" plus at least one real scope
  });

  test("? opens the search palette via the harness's own keydown routing", async ({ page }) => {
    const help = new HelpPage(page);
    await help.openHarness();

    await help.openSearch();
    await expect(help.searchOverlay).toBeVisible();
    await expect(help.searchInput).toBeVisible();
  });

  test('fuzzy canary: "kil" surfaces both the kill-window and kill-pane keymap rows', async ({ page }) => {
    const help = new HelpPage(page);
    await help.openHarness();

    await help.openSearch();
    await page.keyboard.type("kil");
    await expect(help.searchResults.filter({ hasText: "kill-window" })).not.toHaveCount(0);
    await expect(help.searchResults.filter({ hasText: "kill-pane" })).not.toHaveCount(0);
  });

  test("Enter on a keymap row no-ops — the palette stays open, nothing navigates", async ({ page }) => {
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

  test("no Terminal kernel chrome mounts alongside it (no status bar, no window switching)", async ({ page }) => {
    const help = new HelpPage(page);
    await help.openHarness();
    await expect(help.statusBarWindows).toHaveCount(0);
  });
});

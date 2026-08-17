// Behavioral e2e suite for the tmux prefix (Ctrl-b) state machine
// (Terminal.svelte) and the mobile-block card (Shell.astro) — PLAN.md
// Phase 9.
import { expect, test, type Page } from "@playwright/test";

async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

const STATUS_BAR = '[data-testid="status-bar-windows"]';
async function statusBarText(page: Page) {
  return (await page.locator(STATUS_BAR).innerText()).replace(/\s+/g, " ").trim();
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
    expect(await statusBarText(page)).toBe("1:builds 2:personnel* 3:retina-v 4:profile");
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

  test("Ctrl-b n cycles builds -> personnel -> retina-v -> profile -> builds", async ({ page }) => {
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
    await expect(page).toHaveURL(/\/builds$/);
  });

  test("Ctrl-b p cycles the reverse direction", async ({ page }) => {
    await gotoReady(page, "/builds");

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
    expect(await statusBarText(page)).toBe("1:builds* 2:personnel 3:retina-v 4:profile");
  });

  test("Ctrl-b re-arms the window (pressing it twice doesn't require waiting)", async ({ page }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    await ctrlB(page); // re-arm, resetting the 2s window
    await page.keyboard.press("2");
    await expect(page).toHaveURL(/\/personnel$/);
  });

  test("Ctrl-b is inert while the grep overlay is open (grep swallows it)", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    await expect(page.locator('[data-testid="grep-overlay"]')).toBeVisible();

    await ctrlB(page);
    await page.keyboard.press("2");
    // "2" landed in the grep query (grep claimed both keys) — no prefix
    // ever armed, no view switch happened, the overlay is still open.
    await expect(page.locator('[data-testid="grep-query"]')).toContainText("2");
    await expect(page.locator('[data-testid="grep-overlay"]')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
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

  test("a prefixed j does not move the Builds project selection", async ({ page }) => {
    await gotoReady(page, "/builds");
    const doc = page.locator('[data-testid="builds-changes-body"]');
    await expect(doc).toContainText("transcript-tts");

    await ctrlB(page);
    await page.keyboard.press("j");
    // Still transcript-tts — the prefixed "j" was swallowed, never reached
    // Builds.svelte's own j/k handler.
    await expect(doc).toContainText("transcript-tts");
    await expect(page).toHaveURL(/\/builds$/);

    // An un-prefixed "j" right after still works normally.
    await page.keyboard.press("j");
    await expect(doc).toContainText("SafePass");
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

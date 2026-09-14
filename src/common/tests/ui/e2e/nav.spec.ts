// Runs against the real-content build (`pnpm test:e2e` builds then previews `dist/` — see playwright.config.ts's webServer entry).
//
// Bare q/Esc never switch views anywhere — Esc is reserved for modal-exit roles only — so navigation here goes through a status-bar click (`goDashboard()`) instead, with the q/Esc describe block asserting no navigation happens.
import { expect, test, type Page } from "../support/fixtures";
// This spec's `context` fixture (from ../support/fixtures.ts) pre-seeds the boot-seen flag so BootSequence's ~4.6s sequence never runs for these tests.

const STATUS_BAR = '[data-testid="status-bar-windows"]';

async function statusBarText(page: Page) {
  return (await page.locator(STATUS_BAR).innerText()).replace(/\s+/g, " ").trim();
}

/** The full six-window status-bar line, with `activeId` starred — builds
 * the expected string instead of hand-writing it at each call site (a
 * future renumbering/extension of the window list would otherwise touch
 * ~20 literals). */
const WINDOWS = ["dashboard", "repositories", "employment", "retina-v", "profile", "help"];
/** Display NAME per window id — every id equals its own name except
 * "repositories", whose site.yaml name is the shorter "repos" (status bar
 * real estate). */
const WINDOW_NAMES: Record<string, string> = {
  dashboard: "dashboard",
  repositories: "repos",
  employment: "employment",
  "retina-v": "retina-v",
  profile: "profile",
  help: "help",
};
/** `lastId` (real tmux fidelity) is the real tmux `-` flag on the
 * session's PREVIOUSLY active window —
 * omit it for assertions made before any in-test window switch (a fresh
 * `gotoReady`/SSR load has no previous window, so no flag renders). */
function winText(activeId: string, lastId?: string): string {
  return WINDOWS.map((id, i) => `${i}:${WINDOW_NAMES[id]}${id === activeId ? "*" : id === lastId ? "-" : ""}`).join(" ");
}

/** Waits for Terminal.svelte's real keydown/popstate listeners to attach (`[data-terminal-ready="true"]`) — SSR markup renders before hydration completes, so visibility alone isn't proof the app can handle a keypress yet (this race was observed flaking without the wait). */
async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

/** Ctrl-b <digit> — the tmux prefix window-jump binding, the only keyboard
 * way to switch windows (clicks are the other). */
async function prefixDigit(page: Page, digit: string) {
  await page.keyboard.down("Control");
  await page.keyboard.press("b");
  await page.keyboard.up("Control");
  await page.keyboard.press(digit);
}

/** Returns to the dashboard via a status-bar click, since q/Esc never navigate — used as a setup step wherever a test just needs to get back home. */
async function goDashboard(page: Page) {
  await page.locator('[data-testid="status-bar-window"][data-window-id="dashboard"]').click();
  await expect(page).toHaveURL(/\/$/);
}

test.describe("view switching + status bar (bug fix 1: numeric order)", () => {
  test("dashboard shows dashboard active", async ({ page }) => {
    await gotoReady(page, "/");
    await expect(page.locator('[data-testid="dashboard-wordmark"]')).toBeVisible();
    expect(await statusBarText(page)).toBe(winText("dashboard"));
  });

  test("Ctrl-b 1 switches to repositories", async ({ page }) => {
    await gotoReady(page, "/");
    await prefixDigit(page, "1");
    await expect(page).toHaveURL(/\/repositories$/);
    expect(await statusBarText(page)).toBe(winText("repositories", "dashboard"));
  });

  test("Ctrl-b 2 switches to employment", async ({ page }) => {
    await gotoReady(page, "/");
    await prefixDigit(page, "2");
    await expect(page).toHaveURL(/\/employment$/);
    expect(await statusBarText(page)).toBe(winText("employment", "dashboard"));
  });

  test("Ctrl-b 4 switches to profile", async ({ page }) => {
    await gotoReady(page, "/");
    await prefixDigit(page, "4");
    await expect(page).toHaveURL(/\/profile$/);
    expect(await statusBarText(page)).toBe(winText("profile", "dashboard"));
  });

  test("Ctrl-b 3 switches to retina-v — renders BETWEEN employment and profile (bug fix 1)", async ({ page }) => {
    await gotoReady(page, "/");
    await prefixDigit(page, "3");
    await expect(page).toHaveURL(/\/retina-v$/);
    expect(await statusBarText(page)).toBe(winText("retina-v", "dashboard"));
  });

  test("Ctrl-b 5 switches to help", async ({ page }) => {
    await gotoReady(page, "/");
    await prefixDigit(page, "5");
    await expect(page).toHaveURL(/\/help$/);
    expect(await statusBarText(page)).toBe(winText("help", "dashboard"));
  });

  test("? no longer switches to help from the dashboard — it opens the HelpSearch palette instead", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("?");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('[data-testid="help-search-overlay"]')).toBeVisible();
  });
});

test.describe("q / Esc never switch views", () => {
  for (const [key, digit] of [
    ["q", "1"],
    ["q", "2"],
    ["q", "4"],
    ["q", "3"],
    ["q", "5"],
    ["Escape", "1"],
    ["Escape", "2"],
    ["Escape", "4"],
    ["Escape", "3"],
    ["Escape", "5"],
  ] as const) {
    test(`Ctrl-b ${digit} then ${key} does NOT return to the dashboard`, async ({ page }) => {
      await gotoReady(page, "/");
      await prefixDigit(page, digit);
      await expect(page).not.toHaveURL(/\/$/);
      const urlAfterEnter = page.url();
      await page.keyboard.press(key);
      // Still on the same view — the key changed nothing at all.
      await expect(page).toHaveURL(urlAfterEnter);
    });
  }

  test("q and Esc do nothing from the dashboard itself either", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("q");
    await expect(page).toHaveURL(/\/$/);
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/$/);
    expect(await statusBarText(page)).toBe(winText("dashboard"));
  });
});

test.describe("status bar navigation (mouse)", () => {
  test("clicking each window jumps straight to it, from anywhere", async ({ page }) => {
    await gotoReady(page, "/");
    let prev = "dashboard";
    for (const [id, route] of [
      ["repositories", "/repositories"],
      ["employment", "/employment"],
      ["retina-v", "/retina-v"],
      ["profile", "/profile"],
      ["help", "/help"],
      ["dashboard", "/"],
    ] as const) {
      await page.locator(`[data-testid="status-bar-window"][data-window-id="${id}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${route.replace("/", "\\/")}$`));
      expect(await statusBarText(page)).toBe(winText(id, prev));
      prev = id;
    }
  });

  test("every status-bar window has a pointer cursor", async ({ page }) => {
    await gotoReady(page, "/");
    const windows = page.locator('[data-testid="status-bar-window"]');
    await expect(windows).toHaveCount(6);
    const cursors = await windows.evaluateAll((els) => els.map((el) => getComputedStyle(el).cursor));
    expect(cursors.every((c) => c === "pointer")).toBe(true);
  });

  test("clicking the already-active window is a no-op", async ({ page }) => {
    await gotoReady(page, "/repositories");
    await page.locator('[data-testid="status-bar-window"][data-window-id="repositories"]').click();
    await expect(page).toHaveURL(/\/repositories$/);
    expect(await statusBarText(page)).toBe(winText("repositories"));
  });
});

test.describe("URL sync + back/forward", () => {
  test("pushState on switch, popstate on back/forward", async ({ page }) => {
    // Drives home -> employment -> home -> profile to get three distinct
    // history entries to navigate between.
    await gotoReady(page, "/");
    await prefixDigit(page, "2");
    await expect(page).toHaveURL(/\/employment$/);
    await goDashboard(page);
    await prefixDigit(page, "4");
    await expect(page).toHaveURL(/\/profile$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    expect(await statusBarText(page)).toBe(winText("dashboard", "profile"));

    await page.goBack();
    await expect(page).toHaveURL(/\/employment$/);
    expect(await statusBarText(page)).toBe(winText("employment", "dashboard"));

    await page.goForward();
    await expect(page).toHaveURL(/\/$/);
    expect(await statusBarText(page)).toBe(winText("dashboard", "employment"));

    await page.goForward();
    await expect(page).toHaveURL(/\/profile$/);
    expect(await statusBarText(page)).toBe(winText("profile", "dashboard"));
  });

  test("landing directly on a non-home route SSRs the matching view", async ({ page }) => {
    await gotoReady(page, "/retina-v");
    expect(await statusBarText(page)).toBe(winText("retina-v"));
    await goDashboard(page);
  });
});

test.describe("dashboard rename + live footer pane count", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("the tracker menu row reads plain 'Retina-V', not 'E.D.I.T.H: Retina-V'", async ({ page }) => {
    await gotoReady(page, "/");
    const row = page.locator('[data-testid="dashboard-menu-row"][data-menu-id="tracker"]');
    await expect(row).toHaveText(/Retina-V/);
    await expect(row).not.toHaveText(/E\.D\.I\.T\.H/);
  });

  test("footer reads '⚡ synced N/N panes in 48.23ms' with N the live pane count, and it grows after a split", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    const footer = page.getByText(/⚡ synced \d+\/\d+ panes in 48\.23ms/);
    await expect(footer).toHaveText("⚡ synced 6/6 panes in 48.23ms");

    // Split the dashboard's own pane, then come back to it — the count
    // reads the live tmux model (session-wide, not per-window), so it must
    // grow from 6 to 7.
    await page.keyboard.down("Control");
    await page.keyboard.press("b");
    await page.keyboard.up("Control");
    await page.keyboard.press("%");
    await expect(page.locator('[data-testid="pane-leaf"]')).toHaveCount(2);
    await expect(footer).toHaveText("⚡ synced 7/7 panes in 48.23ms");
  });
});

test.describe("modifier fall-through", () => {
  test("a held-modifier keydown is never preventDefault-ed", async ({ page }) => {
    await gotoReady(page, "/");
    const prevented = await page.evaluate(() => {
      const ev = new KeyboardEvent("keydown", {
        key: "l",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    expect(prevented).toBe(false);
    // ...and it must not have triggered a view switch either.
    await expect(page).toHaveURL(/\/$/);
  });

  test("a plain `/` keydown IS preventDefault-ed (reserved for grep)", async ({ page }) => {
    await gotoReady(page, "/");
    const prevented = await page.evaluate(() => {
      const ev = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    expect(prevented).toBe(true);
    // Opening the grep overlay (see grep.spec.ts for its full suite) is never a URL/view switch — the overlay sits atop whichever view/URL was already active.
    await expect(page).toHaveURL(/\/$/);
  });

  // `e.key` is "/" regardless of which modifiers are held, so the modifier check must run before claiming the grep reservation, or Cmd+/ (a real browser/OS shortcut) would get preventDefault-ed too.
  test("a held-modifier `/` keydown (Cmd+/) is NOT preventDefault-ed", async ({ page }) => {
    await gotoReady(page, "/");
    const prevented = await page.evaluate(() => {
      const ev = new KeyboardEvent("keydown", { key: "/", metaKey: true, bubbles: true, cancelable: true });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    expect(prevented).toBe(false);
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("live clock (bug fix 2)", () => {
  // `page.clock.pauseAt()`, not `install()`+`runFor()`, genuinely freezes the clock; it's called before navigation to avoid hydration jitter, and each call targets an absolute offset from t0 so parallel-worker load can't shift the reading (see pipeline.mjs's `captureBootState()` for the same technique applied to boot).
  test("status bar minute advances after 60s of (faked) time", async ({ page }) => {
    const CLOCK_TIME = "2026-08-15T23:34:00";
    const t0 = new Date(CLOCK_TIME).getTime();

    await page.clock.install({ time: CLOCK_TIME });
    await page.clock.pauseAt(t0);
    await page.goto("/");
    await page.clock.pauseAt(t0 + 5000);
    await expect(page.locator('[data-testid="dashboard-wordmark"]')).toBeVisible();

    const before = await page.locator('[data-testid="status-bar-clock-time"]').innerText();
    expect(before).toBe("23:34");
    const beforeDate = await page.locator('[data-testid="status-bar-clock-date"]').innerText();
    expect(beforeDate).toBe("15-Aug-26");

    await page.clock.pauseAt(t0 + 5000 + 61_000);

    const after = await page.locator('[data-testid="status-bar-clock-time"]').innerText();
    expect(after).toBe("23:35");
  });
});

test.describe("wallpaper blur/darken behind windowed views", () => {
  async function wallpaperFilter(page: Page): Promise<string> {
    return page.locator('[data-testid="wallpaper-layer"]').evaluate((el) => getComputedStyle(el).filter);
  }

  test("dashboard/repositories/employment views blur+darken the wallpaper", async ({ page }) => {
    await gotoReady(page, "/");
    let filter = await wallpaperFilter(page);
    expect(filter).toContain("blur");
    expect(filter).toMatch(/brightness/);

    await gotoReady(page, "/repositories");
    filter = await wallpaperFilter(page);
    expect(filter).toContain("blur");
    expect(filter).toMatch(/brightness/);

    await gotoReady(page, "/employment");
    filter = await wallpaperFilter(page);
    expect(filter).toContain("blur");
    expect(filter).toMatch(/brightness/);
  });

  test("retina-v leaves the wallpaper sharp (it IS the content)", async ({ page }) => {
    await gotoReady(page, "/retina-v");
    const filter = await wallpaperFilter(page);
    expect(filter).toBe("none");
  });
});

test.describe("dashboard wordmark restyle + outer chrome removal", () => {
  test("SPIDEY-HUB wordmark is unplated: white fill + red stroke, no bordered plate wrapper", async ({ page }) => {
    await gotoReady(page, "/");
    const wordmark = page.locator('[data-testid="dashboard-wordmark"]');
    await expect(wordmark).toBeVisible();

    const style = await wordmark.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { color: cs.color, strokeWidth: cs.webkitTextStrokeWidth, strokeColor: cs.webkitTextStrokeColor };
    });
    expect(style.color).toBe("rgb(255, 255, 255)");
    expect(style.strokeWidth).not.toBe("0px");
    expect(style.strokeColor).not.toBe("");

    const parentBorder = await wordmark.evaluate((el) => getComputedStyle(el.parentElement as Element).borderStyle);
    expect(parentBorder).toBe("none");
  });

  test("dashboard's outer window card has no background/border/shadow chrome (item 11)", async ({ page }) => {
    await gotoReady(page, "/");
    const card = page.locator('[data-testid="dashboard-wordmark"]').locator("xpath=ancestor::div[2]");
    const style = await card.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { boxShadow: cs.boxShadow, backdropFilter: cs.backdropFilter, borderStyle: cs.borderStyle };
    });
    expect(style.boxShadow).toBe("none");
    expect(style.backdropFilter === "none" || style.backdropFilter === "").toBe(true);
    expect(style.borderStyle).toBe("none");
  });
});

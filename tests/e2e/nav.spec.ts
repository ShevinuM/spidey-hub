// Behavioral e2e suite against the real-content build (PLAN.md
// "Verification commands": `pnpm test:e2e` runs `pnpm build` first, then
// previews `dist/` on port 4322 — see playwright.config.ts's webServer
// entry and package.json's `test:e2e` script).
//
// Phase 3 scope: view switching + status bar text per view (including the
// bug-fix-1 regression: Retina-V renders in numeric order, not appended
// after Profile), modifier-key fall-through, and the live clock (bug fix 2).
//
// PLAN.md Phase 1 rewrite: the window list gained two real windows
// (0:dashboard, 5:help — items 6/13), and bare q/Esc no longer switch views
// anywhere (items 15/16) — Esc is reserved for modal-exit roles only (grep
// close, personnel filter exit, prefix cancel), never a view switch. Every
// test below that used to drive navigation with "q" now uses a status-bar
// click instead (see `goDashboard()`), and the dedicated q/Esc describe
// block is inverted to assert NO navigation happens, in every view.
import { expect, test, type Page } from "./fixtures.ts";
// PLAN.md Phase 5B item 5B.5: this spec's `context` fixture (imported
// from ./fixtures.ts, not raw "@playwright/test") pre-seeds the boot-seen
// sessionStorage flag before every navigation, so BootSequence.svelte's
// ~4.6s unskippable sequence never runs for these tests — see that
// file's header comment for why this is a context-fixture override
// rather than a per-goto-helper change.

const STATUS_BAR = '[data-testid="status-bar-windows"]';

async function statusBarText(page: Page) {
  return (await page.locator(STATUS_BAR).innerText()).replace(/\s+/g, " ").trim();
}

/** The full six-window status-bar line, with `activeId` starred — builds
 * the expected string instead of hand-writing it at each call site (PLAN.md
 * Phase 1 renumbers/extends the window list, touching ~20 literals). */
const WINDOWS = ["dashboard", "builds", "personnel", "retina-v", "profile", "help"];
/** `lastId` (PLAN.md Iteration 3 Phase 4 item 4.3 tmux fidelity reference)
 * is the real tmux `-` flag on the session's PREVIOUSLY active window —
 * omit it for assertions made before any in-test window switch (a fresh
 * `gotoReady`/SSR load has no previous window, so no flag renders). */
function winText(activeId: string, lastId?: string): string {
  return WINDOWS.map((id, i) => `${i}:${id}${id === activeId ? "*" : id === lastId ? "-" : ""}`).join(" ");
}

/**
 * Navigate and wait until Terminal.svelte's real keydown/popstate listeners
 * are attached (`[data-terminal-ready="true"]`) before returning. The SSR'd
 * markup (e.g. the dashboard wordmark, the status bar) is already visible before
 * hydration completes, so it is not by itself proof the app can handle a
 * keypress yet — under real (non-faked) timers this is a genuine race, not
 * a hypothetical one (observed flakily failing without this wait).
 */
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

/** Returns to the dashboard via a status-bar click (PLAN.md Phase 1 item
 * 1.3) — the mouse-only replacement for the retired q/Esc-to-dashboard
 * fallback, used wherever a test merely needs to get back home as a setup
 * step rather than testing navigation itself. */
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

  test("Ctrl-b 1 switches to builds", async ({ page }) => {
    await gotoReady(page, "/");
    await prefixDigit(page, "1");
    await expect(page).toHaveURL(/\/builds$/);
    expect(await statusBarText(page)).toBe(winText("builds", "dashboard"));
  });

  test("Ctrl-b 2 switches to personnel", async ({ page }) => {
    await gotoReady(page, "/");
    await prefixDigit(page, "2");
    await expect(page).toHaveURL(/\/personnel$/);
    expect(await statusBarText(page)).toBe(winText("personnel", "dashboard"));
  });

  test("Ctrl-b 4 switches to profile", async ({ page }) => {
    await gotoReady(page, "/");
    await prefixDigit(page, "4");
    await expect(page).toHaveURL(/\/profile$/);
    expect(await statusBarText(page)).toBe(winText("profile", "dashboard"));
  });

  test("Ctrl-b 3 switches to retina-v — renders BETWEEN personnel and profile (bug fix 1)", async ({ page }) => {
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

test.describe("status bar navigation (mouse) — PLAN.md Phase 1 item 1.3", () => {
  test("clicking each window jumps straight to it, from anywhere", async ({ page }) => {
    await gotoReady(page, "/");
    let prev = "dashboard";
    for (const [id, route] of [
      ["builds", "/builds"],
      ["personnel", "/personnel"],
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
    await gotoReady(page, "/builds");
    await page.locator('[data-testid="status-bar-window"][data-window-id="builds"]').click();
    await expect(page).toHaveURL(/\/builds$/);
    expect(await statusBarText(page)).toBe(winText("builds"));
  });
});

test.describe("URL sync + back/forward", () => {
  test("pushState on switch, popstate on back/forward", async ({ page }) => {
    // Drives home -> personnel -> home -> profile to get three distinct
    // history entries to navigate between.
    await gotoReady(page, "/");
    await prefixDigit(page, "2");
    await expect(page).toHaveURL(/\/personnel$/);
    await goDashboard(page);
    await prefixDigit(page, "4");
    await expect(page).toHaveURL(/\/profile$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    expect(await statusBarText(page)).toBe(winText("dashboard", "profile"));

    await page.goBack();
    await expect(page).toHaveURL(/\/personnel$/);
    expect(await statusBarText(page)).toBe(winText("personnel", "dashboard"));

    await page.goForward();
    await expect(page).toHaveURL(/\/$/);
    expect(await statusBarText(page)).toBe(winText("dashboard", "personnel"));

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

// The old amber toast-strip system (seeded pool pick + fixed auto-dismiss
// overlay) is retired — see tests/e2e/notifications.spec.ts for the
// Mockup-B bell/panel/toast system that replaced it (badge, open/close,
// tabs, read/unread/spam persistence, dismiss semantics, mark-all-read,
// 2-new-per-visit injection, toast auto-dismiss).

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
    // Opening the grep overlay (PLAN.md Phase 8 — see tests/e2e/grep.spec.ts
    // for its own full behavioral suite) is never a URL/view switch: the
    // overlay sits on top of whichever view/URL was already active.
    await expect(page).toHaveURL(/\/$/);
  });

  // Regression guard (Phase 5): Terminal.svelte's handleKey briefly claimed
  // *any* keydown with e.key === "/" as the grep reservation before checking
  // modifiers — `e.key` is "/" regardless of which modifiers are held, so
  // Cmd+/ (a real browser/OS shortcut) was getting preventDefault-ed too.
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
  // PLAN.md Phase 6 item 6.5 deflake: this test previously used
  // `page.clock.runFor()`, which failed once under parallel-worker load
  // (Phase 2 verification) despite passing every time in isolation. Root
  // cause, discriminated empirically while building the Phase 6 boot-golden
  // capture pipeline (see tests/visual/pipeline.mjs's `captureBootState()`
  // header comment for the full writeup): `page.clock.install()` does NOT
  // itself freeze `Date.now()` — real wall-clock time keeps advancing until
  // the FIRST explicit clock-control call, AND after any `runFor()` call
  // finishes, the clock resumes ticking in REAL time again until the next
  // control call. StatusBar.svelte's clock is a self-rescheduling
  // `setTimeout` chain (`msUntilNextMinute`), not a fixed-interval poll, so
  // between this test's two `runFor()` calls — while it read/asserted the
  // "before" DOM text — the clock was already ticking in real wall time
  // again; under enough parallel-worker CPU contention, more than the
  // intended 61s of real time could elapse before the second `runFor()`
  // call ever ran, occasionally rolling the minute display past "23:35" to
  // "23:36" or later by the time it was read.
  //
  // Fixed with `page.clock.pauseAt(<absolute time>)` instead of
  // `runFor(<duration>)` throughout, mirroring `captureBootState()`'s own
  // fix: `pauseAt` leaves the clock genuinely FROZEN at its target instant
  // (confirmed empirically: a bare `setInterval`'s counter and `Date.now()`
  // were byte-identical across two reads separated by a real 500ms wait),
  // so no amount of real time passing between assertions — however slow
  // the runner is — can move the displayed clock. The first `pauseAt` runs
  // BEFORE navigation (eliminating page-load/hydration jitter leaking into
  // the "starting instant" the same way it does for boot), and each
  // subsequent `pauseAt` targets an ABSOLUTE offset from that same t0
  // rather than a relative duration from "whenever this call happens to
  // run" (this is NOT a retry-mask — it's the same root-cause clock-control
  // fix documented for the boot pipeline, applied to a second timer chain).
  test("status bar minute advances after 60s of (faked) time", async ({ page }) => {
    const CLOCK_TIME = "2026-08-15T23:34:00";
    const t0 = new Date(CLOCK_TIME).getTime();

    await page.clock.install({ time: CLOCK_TIME });
    await page.clock.pauseAt(t0); // freeze immediately, before navigation
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

test.describe("wallpaper blur/darken behind windowed views (PLAN.md Iteration 4 item 9)", () => {
  async function wallpaperFilter(page: Page): Promise<string> {
    return page.locator('[data-testid="wallpaper-layer"]').evaluate((el) => getComputedStyle(el).filter);
  }

  test("dashboard/builds/personnel views blur+darken the wallpaper", async ({ page }) => {
    await gotoReady(page, "/");
    let filter = await wallpaperFilter(page);
    expect(filter).toContain("blur");
    expect(filter).toMatch(/brightness/);

    await gotoReady(page, "/builds");
    filter = await wallpaperFilter(page);
    expect(filter).toContain("blur");
    expect(filter).toMatch(/brightness/);

    await gotoReady(page, "/personnel");
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

test.describe("dashboard wordmark restyle + outer chrome removal (PLAN.md Iteration 4 items 10/11)", () => {
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

    // The old bordered plate wrapped the wordmark in its own bordered div;
    // item 10 removes that wrapper entirely, so the wordmark's parent must
    // carry no border of its own.
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

// Behavioral e2e suite against the real-content build (PLAN.md
// "Verification commands": `pnpm test:e2e` runs `pnpm build` first, then
// previews `dist/` on port 4322 — see playwright.config.ts's webServer
// entry and package.json's `test:e2e` script).
//
// Phase 3 scope: view switching + status bar text per view (including the
// bug-fix-1 regression: Retina-V renders in numeric order, not appended
// after Profile), toast dismissal, modifier-key fall-through, and the live
// clock (bug fix 2).
//
// PLAN.md Phase 1 rewrite: the window list gained two real windows
// (0:dashboard, 5:help — items 6/13), and bare q/Esc no longer switch views
// anywhere (items 15/16) — Esc is reserved for modal-exit roles only (grep
// close, personnel filter exit, prefix cancel), never a view switch. Every
// test below that used to drive navigation with "q" now uses a status-bar
// click instead (see `goDashboard()`), and the dedicated q/Esc describe
// block is inverted to assert NO navigation happens, in every view.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { expect, test, E2E_TOAST_SEED, type Page } from "./fixtures.ts";
import { pickToastPair } from "../../src/lib/notifications.ts";
import type { NotificationEntry } from "../../src/lib/data.ts";
// PLAN.md Phase 5B item 5B.5: this spec's `context` fixture (imported
// from ./fixtures.ts, not raw "@playwright/test") pre-seeds the boot-seen
// sessionStorage flag before every navigation, so BootSequence.svelte's
// ~4.6s unskippable sequence never runs for these tests — see that
// file's header comment for why this is a context-fixture override
// rather than a per-goto-helper change. It ALSO pre-seeds the toast-seed
// key (PLAN.md Iteration 3 Phase 2 item 2.4) to `E2E_TOAST_SEED`, so the
// toast-dismissal tests below can compute the exact pinned pair themselves
// (parsing the real notifications.yaml + the real picker) instead of
// hardcoding any notification copy.

const NOTIFICATIONS_YAML_PATH = fileURLToPath(
  new URL("../../src/data/notifications.yaml", import.meta.url),
);

function loadNotificationPool(): NotificationEntry[] {
  const doc = YAML.parse(fs.readFileSync(NOTIFICATIONS_YAML_PATH, "utf8")) as {
    pool: NotificationEntry[];
  };
  return doc.pool;
}

const [pinnedToast0, pinnedToast1] = pickToastPair(loadNotificationPool(), E2E_TOAST_SEED);

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

  test("b switches to builds", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("b");
    await expect(page).toHaveURL(/\/builds$/);
    expect(await statusBarText(page)).toBe(winText("builds", "dashboard"));
  });

  test("p also switches to builds", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("p");
    await expect(page).toHaveURL(/\/builds$/);
    expect(await statusBarText(page)).toBe(winText("builds", "dashboard"));
  });

  test("x switches to personnel", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("x");
    await expect(page).toHaveURL(/\/personnel$/);
    expect(await statusBarText(page)).toBe(winText("personnel", "dashboard"));
  });

  test("i switches to profile", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("i");
    await expect(page).toHaveURL(/\/profile$/);
    expect(await statusBarText(page)).toBe(winText("profile", "dashboard"));
  });

  test("t switches to retina-v — renders BETWEEN personnel and profile (bug fix 1)", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("t");
    await expect(page).toHaveURL(/\/retina-v$/);
    expect(await statusBarText(page)).toBe(winText("retina-v", "dashboard"));
  });

  test("h switches to help (PLAN.md Iteration 3 Phase 3 item 3.4 — replaces the old ? hotkey)", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("h");
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

test.describe("q / Esc never switch views (PLAN.md Phase 1 items 15/16)", () => {
  for (const [key, hotkey] of [
    ["q", "b"],
    ["q", "x"],
    ["q", "i"],
    ["q", "t"],
    ["q", "h"],
    ["Escape", "b"],
    ["Escape", "x"],
    ["Escape", "i"],
    ["Escape", "t"],
    ["Escape", "h"],
  ] as const) {
    test(`${hotkey} then ${key} does NOT return to the dashboard`, async ({ page }) => {
      await gotoReady(page, "/");
      await page.keyboard.press(hotkey);
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
    // Hotkeys only switch views from "home" (mirrors the prototype: once
    // inside a view, only status-bar clicks / the tmux prefix are handled).
    // So this drives home -> personnel -> home -> profile to get three
    // distinct history entries to navigate between.
    await gotoReady(page, "/");
    await page.keyboard.press("x");
    await expect(page).toHaveURL(/\/personnel$/);
    await goDashboard(page);
    await page.keyboard.press("i");
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

test.describe("toast dismissal (seeded pool pick, PLAN.md Iteration 3 Phase 2 item 2.3/2.4)", () => {
  test("the pinned pair renders from the notifications pool", async ({ page }) => {
    await gotoReady(page, "/");
    await expect(page.locator('[data-testid="toast-0"]')).toContainText(pinnedToast0.text);
    await expect(page.locator('[data-testid="toast-1"]')).toContainText(pinnedToast1.text);
  });

  test("dismissing toast 0 removes it (dashboard-only, in-memory)", async ({ page }) => {
    await gotoReady(page, "/");
    const toast0 = page.locator('[data-testid="toast-0"]');
    await expect(toast0).toBeVisible();
    await page.locator('[data-testid="toast-0-dismiss"]').click();
    await expect(toast0).toHaveCount(0);
    // toast 1 is untouched.
    await expect(page.locator('[data-testid="toast-1"]')).toBeVisible();
  });

  test("dismissing toast 1 removes it", async ({ page }) => {
    await gotoReady(page, "/");
    const toast1 = page.locator('[data-testid="toast-1"]');
    await expect(toast1).toBeVisible();
    await page.locator('[data-testid="toast-1-dismiss"]').click();
    await expect(toast1).toHaveCount(0);
  });

  test("toasts do not resurrect after dismissal and leaving/returning to the dashboard", async ({ page }) => {
    await gotoReady(page, "/");
    await page.locator('[data-testid="toast-0-dismiss"]').click();
    await expect(page.locator('[data-testid="toast-0"]')).toHaveCount(0);

    await page.keyboard.press("b");
    await expect(page).toHaveURL(/\/builds$/);
    await goDashboard(page);

    await expect(page.locator('[data-testid="toast-0"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="toast-1"]')).toBeVisible();
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

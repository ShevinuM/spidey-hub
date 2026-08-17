// Behavioral e2e suite against the real-content build (PLAN.md
// "Verification commands": `pnpm test:e2e` runs `pnpm build` first, then
// previews `dist/` on port 4322 — see playwright.config.ts's webServer
// entry and package.json's `test:e2e` script).
//
// Phase 3 scope: view switching + status bar text per view (including the
// bug-fix-1 regression: Retina-V renders in numeric order, not appended
// after Profile), q/Esc-to-dashboard, URL sync + back/forward, toast
// dismissal, modifier-key fall-through, and the live clock (bug fix 2).
import { expect, test, type Page } from "@playwright/test";

const STATUS_BAR = '[data-testid="status-bar-windows"]';

async function statusBarText(page: Page) {
  return (await page.locator(STATUS_BAR).innerText()).replace(/\s+/g, " ").trim();
}

/**
 * Navigate and wait until Terminal.svelte's real keydown/popstate listeners
 * are attached (`[data-terminal-ready="true"]`) before returning. The SSR'd
 * markup (e.g. "SHEVINUM.DEV", the status bar) is already visible before
 * hydration completes, so it is not by itself proof the app can handle a
 * keypress yet — under real (non-faked) timers this is a genuine race, not
 * a hypothetical one (observed flakily failing without this wait).
 */
async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

test.describe("view switching + status bar (bug fix 1: numeric order)", () => {
  test("dashboard shows builds active", async ({ page }) => {
    await gotoReady(page, "/");
    await expect(page.getByText("SHEVINUM.DEV")).toBeVisible();
    expect(await statusBarText(page)).toBe("1:builds* 2:personnel 3:retina-v 4:profile");
  });

  test("b switches to builds", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("b");
    await expect(page).toHaveURL(/\/builds$/);
    expect(await statusBarText(page)).toBe("1:builds* 2:personnel 3:retina-v 4:profile");
  });

  test("p also switches to builds", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("p");
    await expect(page).toHaveURL(/\/builds$/);
    expect(await statusBarText(page)).toBe("1:builds* 2:personnel 3:retina-v 4:profile");
  });

  test("x switches to personnel", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("x");
    await expect(page).toHaveURL(/\/personnel$/);
    expect(await statusBarText(page)).toBe("1:builds 2:personnel* 3:retina-v 4:profile");
  });

  test("i switches to profile", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("i");
    await expect(page).toHaveURL(/\/profile$/);
    expect(await statusBarText(page)).toBe("1:builds 2:personnel 3:retina-v 4:profile*");
  });

  test("t switches to retina-v — renders BETWEEN personnel and profile (bug fix 1)", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("t");
    await expect(page).toHaveURL(/\/retina-v$/);
    expect(await statusBarText(page)).toBe("1:builds 2:personnel 3:retina-v* 4:profile");
  });
});

test.describe("q / Esc return to dashboard from any view", () => {
  for (const [key, hotkey] of [
    ["q", "b"],
    ["q", "x"],
    ["q", "i"],
    ["q", "t"],
    ["Escape", "b"],
    ["Escape", "x"],
    ["Escape", "i"],
    ["Escape", "t"],
  ] as const) {
    test(`${hotkey} then ${key} returns to dashboard`, async ({ page }) => {
      await gotoReady(page, "/");
      await page.keyboard.press(hotkey);
      await expect(page).not.toHaveURL(/\/$/);
      await page.keyboard.press(key);
      await expect(page).toHaveURL(/\/$/);
      expect(await statusBarText(page)).toBe("1:builds* 2:personnel 3:retina-v 4:profile");
    });
  }
});

test.describe("URL sync + back/forward", () => {
  test("pushState on switch, popstate on back/forward", async ({ page }) => {
    // Hotkeys only switch views from "home" (mirrors the prototype: once
    // inside a view, only q/Esc are handled — see advisor guidance in the
    // executor transcript). So this drives home -> personnel -> home ->
    // profile to get three distinct history entries to navigate between.
    await gotoReady(page, "/");
    await page.keyboard.press("x");
    await expect(page).toHaveURL(/\/personnel$/);
    await page.keyboard.press("q");
    await expect(page).toHaveURL(/\/$/);
    await page.keyboard.press("i");
    await expect(page).toHaveURL(/\/profile$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    expect(await statusBarText(page)).toBe("1:builds* 2:personnel 3:retina-v 4:profile");

    await page.goBack();
    await expect(page).toHaveURL(/\/personnel$/);
    expect(await statusBarText(page)).toBe("1:builds 2:personnel* 3:retina-v 4:profile");

    await page.goForward();
    await expect(page).toHaveURL(/\/$/);
    expect(await statusBarText(page)).toBe("1:builds* 2:personnel 3:retina-v 4:profile");

    await page.goForward();
    await expect(page).toHaveURL(/\/profile$/);
    expect(await statusBarText(page)).toBe("1:builds 2:personnel 3:retina-v 4:profile*");
  });

  test("landing directly on a non-home route SSRs the matching view", async ({ page }) => {
    await gotoReady(page, "/retina-v");
    expect(await statusBarText(page)).toBe("1:builds 2:personnel 3:retina-v* 4:profile");
    await page.keyboard.press("q");
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("toast dismissal", () => {
  test("dismissing the danger toast removes it (dashboard-only, in-memory)", async ({ page }) => {
    await gotoReady(page, "/");
    const danger = page.locator('[data-testid="toast-danger"]');
    await expect(danger).toBeVisible();
    await page.locator('[data-testid="toast-danger-dismiss"]').click();
    await expect(danger).toHaveCount(0);
    // The tracker/info toast is untouched.
    await expect(page.locator('[data-testid="toast-tracker"]')).toBeVisible();
  });

  test("dismissing the tracker toast removes it", async ({ page }) => {
    await gotoReady(page, "/");
    const tracker = page.locator('[data-testid="toast-tracker"]');
    await expect(tracker).toBeVisible();
    await page.locator('[data-testid="toast-tracker-dismiss"]').click();
    await expect(tracker).toHaveCount(0);
  });

  test("toasts do not resurrect after dismissal and leaving/returning to the dashboard", async ({ page }) => {
    await gotoReady(page, "/");
    await page.locator('[data-testid="toast-danger-dismiss"]').click();
    await expect(page.locator('[data-testid="toast-danger"]')).toHaveCount(0);

    await page.keyboard.press("b");
    await expect(page).toHaveURL(/\/builds$/);
    await page.keyboard.press("q");
    await expect(page).toHaveURL(/\/$/);

    await expect(page.locator('[data-testid="toast-danger"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="toast-tracker"]')).toBeVisible();
  });
});

test.describe("tracker (Retina-V) back pill (Phase 4)", () => {
  const PILL = '[data-testid="tracker-back-pill"]';
  const LABEL = '[data-testid="tracker-back-label"]';
  const DISMISS = '[data-testid="tracker-back-dismiss"]';

  test("t from dashboard enters tracker with the pill visible", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("t");
    await expect(page).toHaveURL(/\/retina-v$/);
    await expect(page.locator(PILL)).toBeVisible();
    await expect(page.locator(LABEL)).toHaveText("[q] back to dashboard");
  });

  // Note: the prototype also allows `t` to enter the tracker from inside
  // Builds (Homepage.dc.html line 1004, gated on `view === "projects"`).
  // The real Builds view doesn't exist until Phase 5 (it's still an empty
  // placeholder here), so that entry path is out of scope for this phase —
  // do not add it here; it lands alongside Phase 5's Builds keymap.

  test("clicking the pill label returns to dashboard", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("t");
    await expect(page).toHaveURL(/\/retina-v$/);
    await page.locator(LABEL).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("q and Esc still return to dashboard from tracker", async ({ page }) => {
    for (const key of ["q", "Escape"] as const) {
      await gotoReady(page, "/");
      await page.keyboard.press("t");
      await expect(page).toHaveURL(/\/retina-v$/);
      await page.keyboard.press(key);
      await expect(page).toHaveURL(/\/$/);
    }
  });

  test("clicking the dismiss glyph hides the pill until the next tracker entry", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("t");
    await expect(page.locator(PILL)).toBeVisible();

    await page.locator(DISMISS).click();
    await expect(page.locator(PILL)).toHaveCount(0);

    // Leaving and re-entering the tracker view resets the dismissal
    // (prototype's `offBack` is reset to false on every tracker entry —
    // Homepage.dc.html lines 469/897/1004).
    await page.keyboard.press("q");
    await expect(page).toHaveURL(/\/$/);
    await page.keyboard.press("t");
    await expect(page).toHaveURL(/\/retina-v$/);
    await expect(page.locator(PILL)).toBeVisible();
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
    // No view switch: grep is a no-op placeholder until Phase 8.
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
  test("status bar minute advances after 60s of (faked) time", async ({ page }) => {
    await page.clock.install({ time: "2026-08-15T23:34:00" });
    await page.goto("/");
    await page.clock.runFor(5000);
    await expect(page.getByText("SHEVINUM.DEV")).toBeVisible();

    const before = await page.locator('[data-testid="status-bar-clock-time"]').innerText();
    expect(before).toBe("23:34");
    const beforeDate = await page.locator('[data-testid="status-bar-clock-date"]').innerText();
    expect(beforeDate).toBe("15-Aug-26");

    await page.clock.runFor(61_000);

    const after = await page.locator('[data-testid="status-bar-clock-time"]').innerText();
    expect(after).toBe("23:35");
  });
});

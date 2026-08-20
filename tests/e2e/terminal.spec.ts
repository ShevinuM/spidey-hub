// Behavioral e2e safety net for Terminal.svelte's keydown dispatch order and
// view routing, written as a pre-refactor baseline (PLAN.md Phase A) —
// Terminal and Dashboard previously had no dedicated spec (only incidental
// coverage from nav.spec.ts/tmux.spec.ts/boot.spec.ts). This file
// deliberately overlaps those specs in a few places (a safety net is
// supposed to be redundant, not minimal) but focuses on: prefix arm/single-
// shot-disarm, the digit window-jump table end to end, direct-route view
// rendering (nav.spec.ts only ever SSR-checked "/retina-v" directly), the
// global `r` reboot backstop reached from every non-Profile view (boot.spec.ts
// only exercises it from the dashboard and Profile), and the status bar's
// active-window highlight style.
import { expect, test, type Page } from "./fixtures.ts";

const STATUS_BAR = '[data-testid="status-bar-windows"]';
async function statusBarText(page: Page) {
  return (await page.locator(STATUS_BAR).innerText()).replace(/\s+/g, " ").trim();
}

/** Same six-window table as nav.spec.ts/tmux.spec.ts — kept as a local copy
 * per this suite's own convention rather than a shared import, matching how
 * every other e2e spec hand-mirrors this list. */
const WINDOWS = ["dashboard", "builds", "employment", "retina-v", "profile", "help"];
function winText(activeId: string, lastId?: string): string {
  return WINDOWS.map((id, i) => `${i}:${id}${id === activeId ? "*" : id === lastId ? "-" : ""}`).join(" ");
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

test.describe("view routing on direct navigation", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("each of the six routes SSRs its own distinctive view and status-bar entry", async ({ page }) => {
    await gotoReady(page, "/");
    await expect(page.locator('[data-testid="dashboard-wordmark"]')).toBeVisible();
    expect(await statusBarText(page)).toBe(winText("dashboard"));

    await gotoReady(page, "/builds");
    await expect(page.locator('[data-testid="builds-repo-row"]').first()).toBeVisible();
    expect(await statusBarText(page)).toBe(winText("builds"));

    await gotoReady(page, "/employment");
    await expect(page.locator('[data-testid="employment-pos"]')).toBeVisible();
    expect(await statusBarText(page)).toBe(winText("employment"));

    await gotoReady(page, "/retina-v");
    await expect(page.locator('[data-testid="wallpaper-layer"]')).toHaveCSS("filter", "none");
    expect(await statusBarText(page)).toBe(winText("retina-v"));

    await gotoReady(page, "/profile");
    await expect(page.locator('[data-testid="profile-signal-row"]')).toBeVisible();
    expect(await statusBarText(page)).toBe(winText("profile"));

    await gotoReady(page, "/help");
    await expect(page.locator('[data-testid="help-scroller"]')).toBeVisible();
    expect(await statusBarText(page)).toBe(winText("help"));
  });
});

test.describe("tmux prefix: arm, digit dispatch, single-shot disarm", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("Ctrl-b <digit> jumps every window in the table, in order, from the dashboard", async ({ page }) => {
    await gotoReady(page, "/");
    let prev = "dashboard";
    for (const [digit, id] of [
      ["1", "builds"],
      ["2", "employment"],
      ["3", "retina-v"],
      ["4", "profile"],
      ["5", "help"],
    ] as const) {
      await ctrlB(page);
      await page.keyboard.press(digit);
      await expect(page).toHaveURL(id === "help" ? /\/help$/ : new RegExp(`\\/${id}$`));
      expect(await statusBarText(page)).toBe(winText(id, prev));
      prev = id;
    }
    // 0 returns to the dashboard from wherever the loop above landed (help).
    await ctrlB(page);
    await page.keyboard.press("0");
    await expect(page).toHaveURL(/\/$/);
    expect(await statusBarText(page)).toBe(winText("dashboard", "help"));
  });

  test("bare Ctrl-b alone (no following key) navigates nothing — arming is not itself a dispatch", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    await expect(page).toHaveURL(/\/$/);
    expect(await statusBarText(page)).toBe(winText("dashboard"));
  });

  test("the prefix is single-shot: after Ctrl-b 1 lands on builds, a later BARE digit is Builds' own panel-focus key, not a repeat window jump", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await ctrlB(page);
    await page.keyboard.press("1");
    await expect(page).toHaveURL(/\/builds$/);

    // An unprefixed "2" right after does NOT re-arm/jump to employment — it's
    // consumed (if at all) by Builds' own bare-digit panel-focus handling,
    // exactly like tmux.spec.ts's "a prefixed ArrowDown" test proves the
    // reverse precedence (prefix-consumes-first) using panel [3].
    await page.keyboard.press("2");
    await expect(page).toHaveURL(/\/builds$/);
    expect(await statusBarText(page)).toBe(winText("builds", "dashboard"));
  });
});

test.describe("global `r` reboot backstop reaches every view except Profile's own override", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  // boot.spec.ts already covers the full reboot lifecycle (progress reset,
  // outro, hand-off) from the dashboard, plus the Profile-view EXCEPTION
  // (Profile's own `r` downloads the resume instead of rebooting) — this
  // only needs to prove the backstop is reached from the OTHER four views,
  // so it stops as soon as the boot overlay appears rather than waiting out
  // the ~4.6s sequence for each one.
  for (const [path, urlPattern] of [
    ["/builds", /\/builds$/],
    ["/employment", /\/employment$/],
    ["/retina-v", /\/retina-v$/],
    ["/help", /\/help$/],
  ] as const) {
    test(`r reboots from ${path}`, async ({ page }) => {
      await gotoReady(page, path);
      await expect(page).toHaveURL(urlPattern);
      await page.keyboard.press("r");
      await expect(page).toHaveURL(/\/$/);
      await expect(page.locator('[data-testid="boot-sequence"]')).toBeVisible();
    });
  }
});

test.describe("dispatch order: an open overlay claims a key before the global backstop sees it", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  // Proves "keys reach only the thing that currently owns them": grep's own
  // handleKey() runs ahead of the bare-`r`-reboots-from-anywhere backstop
  // (see Terminal.svelte's handleKey ordering comment), so `r` typed while
  // the overlay is open types into the query instead of rebooting.
  test("typing r while the grep overlay is open types into the query, and does not reboot", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    await expect(page.locator('[data-testid="grep-overlay"]')).toBeVisible();

    await page.keyboard.press("r");
    await expect(page.locator('[data-testid="grep-query"]')).toContainText("r");
    await expect(page.locator('[data-testid="boot-sequence"]')).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
  });

  // Symmetric case from the OTHER direction (tmux.spec.ts's "prefix works
  // even while grep is open" already proves prefix > grep for a digit
  // target) — here a bare `r` typed after arming the prefix mid-grep is the
  // window-kill-adjacent reboot letter, not a query character, so the
  // prefix must consume it before grep ever sees it. `r` has no bound
  // prefix command, so it's simply swallowed (same class of proof
  // tmux.spec.ts's "a prefixed \"/\" is swallowed" test uses for grep's own
  // opener key).
  test("Ctrl-b r while grep is open is swallowed by the (unbound) prefix dispatch, not typed into the query", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    await expect(page.locator('[data-testid="grep-overlay"]')).toBeVisible();

    await ctrlB(page);
    await page.keyboard.press("r");
    // The query span always renders a trailing blinking-cursor glyph
    // alongside the query text itself (GrepOverlay.svelte), so an empty
    // query's `textContent` is that glyph, never a literal empty string —
    // asserting the query stayed empty means asserting "r" never landed in
    // it, not that the span's text is "".
    await expect(page.locator('[data-testid="grep-query"]')).not.toContainText("r");
    await expect(page.locator('[data-testid="boot-sequence"]')).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("status bar active-window highlight", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  async function bg(page: Page, id: string) {
    return page.locator(`[data-testid="status-bar-window"][data-window-id="${id}"]`).evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
  }

  test("only the active window's span carries the red highlight background; it moves on switch", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    expect(await bg(page, "dashboard")).toBe("rgb(224, 69, 60)");
    for (const id of ["builds", "employment", "retina-v", "profile", "help"]) {
      expect(await bg(page, id)).not.toBe("rgb(224, 69, 60)");
    }

    await ctrlB(page);
    await page.keyboard.press("2");
    await expect(page).toHaveURL(/\/employment$/);
    expect(await bg(page, "employment")).toBe("rgb(224, 69, 60)");
    expect(await bg(page, "dashboard")).not.toBe("rgb(224, 69, 60)");
  });
});

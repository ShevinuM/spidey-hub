// Behavioral e2e suite for the signal-inbox bell/panel/toast system
// (src/components/Notifications.svelte, backed by
// src/lib/notificationStore.ts) — Mockup B, dashboard-view only. Covers:
// badge/toast injection on a fresh visit, open/close via bell click/n/Esc,
// tab switching (including the alerts-tab derived filter), read/unread
// toggling, dismiss semantics per folder, mark-as-spam, mark-all-read,
// read/unread/spam/archive persistence ACROSS RELOAD via localStorage, the
// 2-new-per-visit pool injection, and toast auto-dismiss/hover-pause via the
// shortened test-duration hook (tests/e2e/fixtures.ts) rather than sleeping
// through the real severity timers.
import { join } from "node:path";
import { expect, test, E2E_NOTIFICATIONS_INJECT_SEED, E2E_TOAST_DURATION_SCALE, type Page } from "../../../../../../common/tests/ui/support/fixtures";
import { mulberry32, pickRandomUnseen, TOAST_DURATION_MS, type NotificationSeverity, type PoolEntry } from "../../../../../lib/notificationStore";
import { readContentDir } from "../../../../../../common/tests/ui/support/content-fixtures";

const ROOT = join(import.meta.dirname, "../../../../../..");

interface NotificationFrontmatter {
  sev: PoolEntry["sev"];
  title: string;
  src: string;
  order: number;
}

/** Reads the real `notifications` content collection (src/content/
 * notifications/*.md), sorted by frontmatter `order` — the same order
 * src/common/lib/data.ts's `buildNotificationPool` reconstructs at build time, so
 * this suite's seeded pick expectations match the real site. */
function loadPool(): PoolEntry[] {
  const entries = readContentDir<NotificationFrontmatter>(join(ROOT, "src/content/notifications"));
  return entries
    .slice()
    .sort((a, b) => a.data.order - b.data.order)
    .map((e) => ({ id: e.id, sev: e.data.sev, title: e.data.title, body: e.body, src: e.data.src }));
}

const POOL = loadPool();

/** What the FIRST visit injects, computed the exact same way
 * injectVisit()/pickRandomUnseen() does, against the fixed seed
 * tests/e2e/fixtures.ts pre-seeds for every test in this file — no
 * notification copy is hardcoded here (content-purity), same convention the
 * old toast spec followed. */
const [firstA, firstB] = pickRandomUnseen(POOL, new Set(), 2, mulberry32(E2E_NOTIFICATIONS_INJECT_SEED));

/** What a SECOND visit (after the first two ids are already "seen" in
 * localStorage) injects next — same seed, smaller remaining pool. */
const [secondA, secondB] = pickRandomUnseen(POOL, new Set([firstA.id, firstB.id]), 2, mulberry32(E2E_NOTIFICATIONS_INJECT_SEED));

async function gotoReady(page: Page, path = "/") {
  await page.goto(path);
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

const bell = (page: Page) => page.locator('[data-testid="notifications-bell"]');
const panel = (page: Page) => page.locator('[data-testid="notifications-panel"]');
const rows = (page: Page) => page.locator('[data-testid="notification-row"]');
const row = (page: Page, id: string) => page.locator(`[data-testid="notification-row"][data-notification-id="${id}"]`);
const tab = (page: Page, id: string) => page.locator(`[data-testid="notifications-tab"][data-tab="${id}"]`);
const toasts = (page: Page) => page.locator('[data-testid="toast"]');

test.describe("signal inbox: badge + toast injection on a fresh visit", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("a fresh visit injects exactly 2 unseen pool entries, badge shows 2, both toast", async ({ page }) => {
    await gotoReady(page, "/");
    await expect(bell(page)).toHaveAttribute("data-unread-count", "2");
    await expect(toasts(page)).toHaveCount(2);
    await expect(page.getByText(firstA.title, { exact: true })).toBeVisible();
    await expect(page.getByText(firstB.title, { exact: true })).toBeVisible();
  });

  test("the panel is closed by default", async ({ page }) => {
    await gotoReady(page, "/");
    await expect(panel(page)).toHaveCount(0);
  });
});

async function prefixDigit(page: Page, digit: string) {
  await page.keyboard.down("Control");
  await page.keyboard.press("b");
  await page.keyboard.up("Control");
  await page.keyboard.press(digit);
}

test.describe("signal inbox: dashboard-only visibility", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("the bell doesn't render on a non-dashboard view", async ({ page }) => {
    await gotoReady(page, "/");
    await expect(bell(page)).toBeVisible();
    await prefixDigit(page, "1"); // -> repositories
    await expect(page).toHaveURL(/\/repositories$/);
    await expect(bell(page)).toHaveCount(0);
  });

  test("an open panel is hidden while away, and reappears on returning to the dashboard", async ({ page }) => {
    await gotoReady(page, "/");
    await bell(page).click();
    await expect(panel(page)).toBeVisible();

    await prefixDigit(page, "1"); // -> repositories
    await expect(page).toHaveURL(/\/repositories$/);
    await expect(panel(page)).toHaveCount(0);
    await expect(bell(page)).toHaveCount(0);

    await prefixDigit(page, "0"); // -> dashboard
    await expect(page).toHaveURL(/\/$/);
    await expect(panel(page)).toBeVisible();
  });
});

test.describe("signal inbox: open/close", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("clicking the bell opens the panel; clicking again closes it", async ({ page }) => {
    await gotoReady(page, "/");
    await bell(page).click();
    await expect(panel(page)).toBeVisible();
    await bell(page).click();
    await expect(panel(page)).toHaveCount(0);
  });

  test("`n` toggles the panel open and closed", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("n");
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press("n");
    await expect(panel(page)).toHaveCount(0);
  });

  test("Esc closes the panel only while it's open", async ({ page }) => {
    await gotoReady(page, "/");
    await bell(page).click();
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
  });

  test("the close (✕) button in the header closes the panel", async ({ page }) => {
    await gotoReady(page, "/");
    await bell(page).click();
    await page.locator('[data-testid="notifications-close"]').click();
    await expect(panel(page)).toHaveCount(0);
  });
});

test.describe("signal inbox: tabs", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("inbox tab shows both freshly-injected items; alerts tab is a derived filter of inbox alerts", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await bell(page).click();
    await expect(tab(page, "inbox")).toContainText("2");
    await expect(rows(page)).toHaveCount(2);

    const expectedAlerts = [firstA, firstB].filter((p) => p.sev === "alert").length;
    await expect(tab(page, "alerts")).toContainText(String(expectedAlerts));
    await tab(page, "alerts").click();
    await expect(rows(page)).toHaveCount(expectedAlerts);

    await expect(tab(page, "archive")).toContainText("0");
    await expect(tab(page, "spam")).toContainText("0");
  });
});

test.describe("signal inbox: read/unread", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("toggling a row read decrements the unread badge; toggling back restores it", async ({ page }) => {
    await gotoReady(page, "/");
    await bell(page).click();
    await expect(bell(page)).toHaveAttribute("data-unread-count", "2");

    const toggleFirst = row(page, firstA.id).locator('[data-testid="notification-toggle-read"]');
    await expect(toggleFirst).toHaveAttribute("title", "mark as read");
    await toggleFirst.click();
    await expect(bell(page)).toHaveAttribute("data-unread-count", "1");
    await expect(toggleFirst).toHaveAttribute("title", "mark as unread");

    await toggleFirst.click();
    await expect(bell(page)).toHaveAttribute("data-unread-count", "2");
  });

  test("mark all read clears the inbox badge without deleting anything", async ({ page }) => {
    await gotoReady(page, "/");
    await bell(page).click();
    await page.locator('[data-testid="notifications-mark-all-read"]').click();
    await expect(bell(page)).toHaveAttribute("data-unread-count", "0");
    await expect(rows(page)).toHaveCount(2);
  });
});

test.describe("signal inbox: dismiss semantics per folder", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("dismissing an inbox item archives it (and marks it read), never deletes it", async ({ page }) => {
    await gotoReady(page, "/");
    await bell(page).click();
    await row(page, firstA.id).locator('[data-testid="notification-dismiss"]').click();
    await expect(row(page, firstA.id)).toHaveCount(0);
    await expect(tab(page, "inbox")).toContainText("1");
    await expect(tab(page, "archive")).toContainText("1");

    await tab(page, "archive").click();
    const archived = row(page, firstA.id);
    await expect(archived).toBeVisible();
    await expect(archived.locator('[data-testid="notification-toggle-read"]')).toHaveAttribute("title", "mark as unread");
  });

  test("dismissing an archived item deletes it outright", async ({ page }) => {
    await gotoReady(page, "/");
    await bell(page).click();
    await row(page, firstA.id).locator('[data-testid="notification-dismiss"]').click(); // inbox -> archive
    await tab(page, "archive").click();
    await row(page, firstA.id).locator('[data-testid="notification-dismiss"]').click(); // archive -> deleted
    await expect(row(page, firstA.id)).toHaveCount(0);
    await expect(tab(page, "archive")).toContainText("0");
  });

  test("mark-as-spam moves an item to web·trap; dismissing FROM spam deletes it outright", async ({ page }) => {
    await gotoReady(page, "/");
    await bell(page).click();
    await row(page, firstA.id).locator('[data-testid="notification-mark-spam"]').click();
    await expect(row(page, firstA.id)).toHaveCount(0);
    await expect(tab(page, "inbox")).toContainText("1");
    await expect(tab(page, "spam")).toContainText("1");

    await tab(page, "spam").click();
    await expect(page.getByText("caught in the web")).toBeVisible();
    const spammed = row(page, firstA.id);
    await expect(spammed).toBeVisible();
    // Deviation from the mockup: spam rows show no mark-as-spam
    // action (already spam).
    await expect(spammed.locator('[data-testid="notification-mark-spam"]')).toHaveCount(0);
    await spammed.locator('[data-testid="notification-dismiss"]').click();
    await expect(row(page, firstA.id)).toHaveCount(0);
    await expect(tab(page, "spam")).toContainText("0");
  });

  // Phase 7b.2 (PLAN.md): the zero-notification state can't live in the
  // fixture dataset (it would collide with the toast-bearing visual
  // recipes seeded by TOAST_SEED — see recipes.ts's own comment on
  // notificationStore's `buildFixtureState()`), so it's reached here
  // instead, as a dismiss-all interaction against the two items a fresh
  // visit always injects. Dismissing FROM the inbox only archives (see
  // "dismissing an inbox item archives it" above), which is enough to
  // empty the inbox tab itself and surface `notifications-empty` — no
  // need to delete outright.
  test("dismissing every inbox item surfaces the zero-notification empty state", async ({ page }) => {
    await gotoReady(page, "/");
    await bell(page).click();
    await expect(rows(page)).toHaveCount(2);

    await row(page, firstA.id).locator('[data-testid="notification-dismiss"]').click();
    await row(page, firstB.id).locator('[data-testid="notification-dismiss"]').click();

    await expect(bell(page)).toHaveAttribute("data-unread-count", "0");
    await expect(tab(page, "inbox")).toContainText("0");
    await expect(rows(page)).toHaveCount(0);
    await expect(page.locator('[data-testid="notifications-empty"]')).toBeVisible();
  });
});

test.describe("signal inbox: persistence across reload (localStorage)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("read/archive/spam state survives a reload", async ({ page }) => {
    await gotoReady(page, "/");
    await bell(page).click();
    await row(page, firstA.id).locator('[data-testid="notification-toggle-read"]').click(); // firstA -> read
    await row(page, firstB.id).locator('[data-testid="notification-dismiss"]').click(); // firstB -> archive+read

    await gotoReady(page, "/");
    await bell(page).click();
    await expect(row(page, firstA.id).locator('[data-testid="notification-toggle-read"]')).toHaveAttribute(
      "title",
      "mark as unread",
    );
    await tab(page, "archive").click();
    await expect(row(page, firstB.id)).toBeVisible();
  });

  test("a reload is a new visit: the next 2 unseen pool entries are injected, never the same ones twice", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await expect(toasts(page)).toHaveCount(2);

    await gotoReady(page, "/");
    await bell(page).click();
    await expect(row(page, secondA.id)).toBeVisible();
    await expect(row(page, secondB.id)).toBeVisible();
    // The original pair is still present too (never re-injected, never
    // duplicated) — 4 total items now.
    await expect(rows(page)).toHaveCount(4);
  });

  test("corrupted localStorage resets gracefully instead of breaking the panel", async ({ page }) => {
    await gotoReady(page, "/");
    await page.evaluate(() => localStorage.setItem("spideyhub.notifications.v1", "{{{not json"));
    await gotoReady(page, "/");
    await bell(page).click();
    await expect(panel(page)).toBeVisible();
    // A fresh visit against reset (empty) storage injects 2 again.
    await expect(rows(page)).toHaveCount(2);
  });
});

test.describe("signal inbox: toast auto-dismiss + hover-pause", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  // tests/e2e/fixtures.ts pre-seeds a duration-scale override
  // (E2E_TOAST_DURATION_SCALE) so even the longest (alert, 10s) severity
  // timer resolves in a few seconds — no sleeping through the real
  // durations, and no page.clock (CSS `drain` runs on real wall-clock time,
  // untouched by faked JS timers). The scale is deliberately not so
  // aggressive that a toast's own dismiss timer can fire while it's still
  // mid-entrance-transform (see fixtures.ts's own comment on the constant).
  const maxScaledMs = Math.round(TOAST_DURATION_MS.alert * E2E_TOAST_DURATION_SCALE);

  test("both toasts auto-dismiss on their own", async ({ page }) => {
    await gotoReady(page, "/");
    await expect(toasts(page)).toHaveCount(2);
    await expect(toasts(page)).toHaveCount(0, { timeout: maxScaledMs + 2000 });
  });

  test("hovering a toast pauses its dismissal; releasing resumes it", async ({ page }) => {
    await gotoReady(page, "/");
    const first = toasts(page).first();
    const toastId = await first.getAttribute("data-toast-id");
    const sev = (await first.getAttribute("data-severity")) as NotificationSeverity;
    const scaledMs = Math.round(TOAST_DURATION_MS[sev] * E2E_TOAST_DURATION_SCALE);

    await first.hover();
    // Held well past this toast's own scaled duration — still here, paused.
    await page.waitForTimeout(scaledMs + 300);
    const held = page.locator(`[data-testid="toast"][data-toast-id="${toastId}"]`);
    await expect(held).toBeVisible();

    await page.mouse.move(0, 0); // release (mouseleave)
    // Holding right after mount pauses the timer with nearly its FULL
    // duration still remaining, so releasing needs up to ~scaledMs again
    // (not a flat short timeout) before the resumed timer fires.
    await expect(held).toHaveCount(0, { timeout: scaledMs + 2000 });
  });
});

test.describe("signal inbox: reboot", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("reboot closes an open panel", async ({ page }) => {
    await gotoReady(page, "/");
    await bell(page).click();
    await expect(panel(page)).toBeVisible();
    await page.locator('[data-testid="status-bar-reboot"]').click();
    await expect(page.locator('[data-testid="boot-sequence"]')).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
  });
});

// PLAN.md Phase 7.3: the row-list body already declares `overflow-y:auto`
// (NotificationsPanel.svelte's `[flex:1;min-height:120px;overflow-y:auto]`
// div), but — like every other iteration-6 panel before Phase 3 fixed
// them — that declaration had never been asserted, so a future regression
// back to bare `overflow:hidden` would ship silently.
//
// `overflowY === "auto"` alone is not the falsifiable signal here (a CSS
// property can be correctly declared and still fail to scroll for other
// reasons); pairing it with an actual wheel-driven `scrollTop` move is
// what the PLAN's own "verifier notes" warn is required — a container
// assertion alone can pass vacuously. `scrollHeight > clientHeight` is
// deliberately NOT asserted on its own either: it's true regardless of
// whether `overflow-y` is `auto` or `hidden` (it measures content, not
// scrollability), so a broken `overflow:hidden` panel would still pass it.
//
// Forces overflow the same way tests/e2e/employment.spec.ts's scroll
// coverage does (PLAN.md Phase 3's "verifier notes" #5): shrinks the
// viewport rather than adding fixture data, since Phase 7b.2 (not yet
// landed) owns adding adversarial fixture content. Measured empirically
// against the real pool (a fresh visit always injects exactly 2 unseen
// entries): at 1470x340 the row body's `min-height:120px` floor holds
// `clientHeight` at 120px while the 2 real rows need ~150-165px, a stable,
// non-viewport-dependent overflow — not a coincidence of any one pool
// entry's copy length.
test.describe("signal inbox: notifications panel body scrolls", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  const panelBody = (page: Page) => panel(page).locator("> div").nth(2);

  test("overflow-y is auto and the body actually overflows with the real 2-item fresh-visit injection", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1470, height: 340 });
    await gotoReady(page, "/");
    await bell(page).click();
    await expect(panel(page)).toBeVisible();
    await expect(rows(page)).toHaveCount(2);

    const body = panelBody(page);
    expect(await body.evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
    const { scrollHeight, clientHeight } = await body.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollHeight).toBeGreaterThan(clientHeight);
  });

  test("the mouse wheel actually scrolls the body (overflow-y:auto is not merely declared)", async ({ page }) => {
    await page.setViewportSize({ width: 1470, height: 340 });
    await gotoReady(page, "/");
    await bell(page).click();
    await expect(panel(page)).toBeVisible();

    const body = panelBody(page);
    const box = await body.boundingBox();
    if (!box) throw new Error("notifications panel body has no bounding box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    const before = await body.evaluate((el) => el.scrollTop);
    expect(before).toBe(0);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(before);
  });
});

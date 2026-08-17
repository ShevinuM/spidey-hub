// Behavioral e2e suite for the grep overlay (GrepOverlay.svelte), against
// the real-content build — PLAN.md Phase 8.
//
// Real index: public/generated/grep-index.json, refreshed by `pnpm
// generate` (which `pnpm build` runs as its `prebuild` hook — see
// package.json) immediately before this suite's own build, so reading that
// file here reflects exactly what the served `dist/` copy contains. Every
// numeric assertion below (file counts, hit counts, counter text) is
// computed from that file at test time via the same `search`/`formatCount`
// port the component itself uses (src/lib/grep.ts, already unit-tested in
// tests/unit/grep.test.ts) — never hardcoded — so this suite can't drift
// from the index's real contents as the site's own source grows.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { search, formatCount, type RepoFile } from "../../src/lib/grep.ts";

const ROOT = join(import.meta.dirname, "../..");

async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

function realIndex(): RepoFile[] {
  return JSON.parse(readFileSync(join(ROOT, "public/generated/grep-index.json"), "utf8")) as RepoFile[];
}

const overlay = (page: Page) => page.locator('[data-testid="grep-overlay"]');
const listEl = (page: Page) => page.locator('[data-testid="grep-list"]');
const queryText = (page: Page) => page.locator('[data-testid="grep-query"]');
const counterText = (page: Page) => page.locator('[data-testid="grep-counter"]');
const modeText = (page: Page) => page.locator('[data-testid="grep-mode"]');
const rows = (page: Page) => page.locator('[data-testid="grep-row"]');
const rowByPath = (page: Page, path: string) => page.locator(`[data-testid="grep-row"][data-path="${path}"]`);

test.describe("Grep overlay", () => {
  test.beforeEach(async ({ page }) => {
    // Same network-determinism rule as the visual suite (PLAN.md "Network
    // determinism"): Builds' own commit-refresh island fires on mount, and
    // none of these tests should depend on api.github.com's real
    // availability. Grep itself never calls it (verified explicitly below).
    await page.route("**/api.github.com/**", (route) => route.abort());
  });

  test("/ from the dashboard opens the overlay; empty-query counter is file-count/file-count", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    await expect(overlay(page)).toBeVisible();

    const files = realIndex();
    await expect(counterText(page)).toHaveText(`${files.length}/${files.length}`);
    await expect(modeText(page)).toHaveText("repo files · shevinum.dev@main");
  });

  test("/ from profile opens the overlay over profile without touching it; Esc returns to profile intact", async ({
    page,
  }) => {
    await gotoReady(page, "/profile");
    await expect(page.locator('[data-testid="profile-close"]')).toBeVisible();

    await page.keyboard.press("/");
    await expect(overlay(page)).toBeVisible();
    // The view beneath is never unmounted or mutated while the overlay is up.
    await expect(page.locator('[data-testid="profile-close"]')).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(overlay(page)).not.toBeVisible();
    await expect(page.locator('[data-testid="profile-close"]')).toBeVisible();
  });

  test("typing filters the results — 'grep.ts' finds src/lib/grep.ts by path", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    await page.keyboard.type("grep.ts");
    await expect(queryText(page)).toContainText("grep.ts");
    await expect(rowByPath(page, "src/lib/grep.ts")).toBeVisible();
  });

  test("counter format for a live query matches the real index (hits/totalLines)", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    await page.keyboard.type("svelte");

    const files = realIndex();
    const hits = search(files, "svelte");
    const expected = formatCount(hits, files, "svelte");

    await expect(counterText(page)).toHaveText(expected);
    await expect(modeText(page)).toHaveText("live_grep · shevinum.dev@main");
  });

  test("Enter on a personnel content hit lands in the personnel view", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    // "software-developer-co-op" is a path-only substring (the term never
    // appears as body text elsewhere in the real index — verified against
    // the committed index), so its one path-hit row is deterministically
    // the first (sel resets to 0 on every query edit).
    await page.keyboard.type("software-developer-co-op");
    await expect(rows(page).first()).toHaveAttribute(
      "data-path",
      "src/content/personnel/Enaimco/software-developer-co-op.md",
    );
    await page.keyboard.press("Enter");
    await expect(overlay(page)).not.toBeVisible();
    await expect(page.locator('[data-testid="personnel-path"]')).toBeVisible();
  });

  test("Enter on a Builds.svelte hit lands in the builds view", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    await page.keyboard.type("Builds.svelte");
    await expect(rows(page).first()).toHaveAttribute("data-path", "src/components/Builds.svelte");
    await page.keyboard.press("Enter");
    await expect(overlay(page)).not.toBeVisible();
    await expect(page.locator('[data-testid="builds-panel-2"]')).toBeVisible();
  });

  test("Enter with no results just closes the overlay (no navigation)", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    // A query guaranteed not to match anything: generated at run time (not
    // a string literal), so it can never accidentally appear as text
    // in the very index this suite's own source is walked into
    // (scripts/generate.mjs indexes tests/**, including this file).
    const nonceQuery = `zz-no-match-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await page.keyboard.type(nonceQuery);
    await expect(page.locator('[data-testid="grep-empty"]')).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(overlay(page)).not.toBeVisible();
    await expect(page.getByText("SHEVINUM.DEV")).toBeVisible();
  });

  test("Ctrl-u clears the query; counter returns to the file-count total", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    await page.keyboard.type("svelte");
    await expect(queryText(page)).toContainText("svelte");

    await page.keyboard.press("Control+u");
    // Only the blinking cursor glyph remains once the query is empty.
    await expect(queryText(page)).toHaveText("▌");

    const files = realIndex();
    await expect(counterText(page)).toHaveText(`${files.length}/${files.length}`);
  });

  test("Ctrl-w also clears the query", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    await page.keyboard.type("svelte");
    await page.keyboard.press("Control+w");
    await expect(queryText(page)).toHaveText("▌");
  });

  test("ctrl-n/ctrl-p move the selection (with ↑/↓ parity)", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    await expect(rows(page).first()).toHaveAttribute("data-selected", "true");

    await page.keyboard.press("Control+n");
    await expect(rows(page).nth(1)).toHaveAttribute("data-selected", "true");
    await expect(rows(page).first()).toHaveAttribute("data-selected", "false");

    await page.keyboard.press("Control+p");
    await expect(rows(page).first()).toHaveAttribute("data-selected", "true");

    await page.keyboard.press("ArrowDown");
    await expect(rows(page).nth(1)).toHaveAttribute("data-selected", "true");
    await page.keyboard.press("ArrowUp");
    await expect(rows(page).first()).toHaveAttribute("data-selected", "true");
  });

  test("/ works from inside the personnel editor", async ({ page }) => {
    await gotoReady(page, "/personnel");
    await page.keyboard.press("Enter"); // -> roles level
    await page.keyboard.press("Enter"); // -> editor
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();

    await page.keyboard.press("/");
    await expect(overlay(page)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(overlay(page)).not.toBeVisible();
    // Closing the overlay lands back on the exact same underlying state —
    // the editor, not the browser or the dashboard.
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
  });

  test("/ preventDefaults and wins over personnel filter-mode typing", async ({ page }) => {
    await gotoReady(page, "/personnel");
    await page.keyboard.press("Enter"); // -> roles level
    await page.keyboard.press("f"); // -> filter mode
    await expect(page.locator('[data-testid="personnel-prompt"]')).toBeVisible();

    await page.keyboard.press("/");
    await expect(overlay(page)).toBeVisible();
    // "/" must not have been typed into the personnel filter prompt.
    await expect(page.locator('[data-testid="personnel-prompt"]')).not.toContainText("/");
  });

  test("overlay list row count matches this viewport's own computed fit", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    await expect(listEl(page)).toBeVisible();

    const expectedRows = await listEl(page).evaluate((el) => Math.max(4, Math.floor(el.clientHeight / 22)));
    await expect(rows(page)).toHaveCount(expectedRows);
  });

  test("grep never calls api.github.com", async ({ page }) => {
    const githubRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("api.github.com")) githubRequests.push(req.url());
    });

    await gotoReady(page, "/");
    await page.keyboard.press("/");
    await page.keyboard.type("svelte");
    await page.keyboard.press("Control+n");
    await page.keyboard.press("Escape");

    expect(githubRequests).toEqual([]);
  });
});

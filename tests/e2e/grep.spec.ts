// Behavioral e2e suite for the grep overlay (GrepOverlay.svelte), against
// the real-content build.
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
import { expect, test, type Page } from "./fixtures.ts";
// This spec's `context` fixture (imported
// from ./fixtures.ts, not raw "@playwright/test") pre-seeds the boot-seen
// sessionStorage flag before every navigation, so BootSequence.svelte's
// ~4.6s unskippable sequence never runs for these tests — see that
// file's header comment for why this is a context-fixture override
// rather than a per-goto-helper change.
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
    // Same network-determinism rule as the visual suite: Repositories' own
    // commit-refresh island fires on mount, and
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
    await expect(page.locator('[data-testid="profile-signal-row"]')).toBeVisible();

    await page.keyboard.press("/");
    await expect(overlay(page)).toBeVisible();
    // The view beneath is never unmounted or mutated while the overlay is up.
    await expect(page.locator('[data-testid="profile-signal-row"]')).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(overlay(page)).not.toBeVisible();
    await expect(page.locator('[data-testid="profile-signal-row"]')).toBeVisible();
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

  test("Enter on an employment content hit lands in the employment view", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    // The co-op role's own frontmatter `role:` line: personnel-collection content is a
    // path-derived tree where every leaf is literally named "role.md" — that
    // bare filename alone is not a unique search term across the whole
    // index, since it's also a substring of test files/fixtures that
    // mention this content's own path. This exact frontmatter value only
    // ever appears in the one real content file, verified against the
    // committed index.
    await page.keyboard.type('role: "Software Developer, Co-op"');
    await expect(rows(page).first()).toHaveAttribute(
      "data-path",
      "src/content/personnel/enaimco/software-developer/co-op/role.md",
    );
    await page.keyboard.press("Enter");
    await expect(overlay(page)).not.toBeVisible();
    // There is no `employment-path` breadcrumb element. GrepOverlay's own
    // routing (`grepPathToView`, src/lib/views.ts) is coarse — it only
    // switches the active VIEW to "employment", it never deep-links to the
    // specific directory the hit lives in — so the real claim here is just
    // "we landed on the employment view", never anything path-specific;
    // `employment-preview` (unconditionally rendered by the EmploymentRecords view)
    // is the equivalent-strength anchor for that claim.
    await expect(page.locator('[data-testid="employment-preview"]')).toBeVisible();
  });

  test("Enter on a Repositories.svelte hit lands in the repositories view", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    // A path-fragment query, not a bare filename: plenty of OTHER files'
    // header comments mention "Repositories.svelte" in prose (e.g.
    // CopyMode.svelte's data-copy-source contract doc), which would
    // otherwise win the path-substring-vs-content-hit race for
    // `rows(page).first()` depending on alphabetical file order. This
    // fragment only ever matches the real component's own PATH.
    await page.keyboard.type("components/repositories/Repositories.svelte");
    await expect(rows(page).first()).toHaveAttribute("data-path", "src/components/repositories/Repositories.svelte");
    await page.keyboard.press("Enter");
    await expect(overlay(page)).not.toBeVisible();
    await expect(page.locator('[data-testid="repositories-panel-2"]')).toBeVisible();
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
    await expect(page.locator('[data-testid="dashboard-wordmark"]')).toBeVisible();
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

  // No vim jump extras here — grep is a live text-search box, and "g"/"G"
  // are just printable characters like any other, appended to the query.
  test("g and G are typed into the query like any other character (no jump)", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");

    await page.keyboard.press("g");
    await page.keyboard.press("g");
    await expect(queryText(page)).toContainText("gg");

    await page.keyboard.press("G");
    await expect(queryText(page)).toContainText("ggG");
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

  test("/ inside the employment editor searches the buffer instead of opening grep (editor gets first refusal)", async ({
    page,
  }) => {
    // v2 (flat list + timeline): row
    // 0 (newest) is selected by default, so a single Enter opens its
    // role.md directly — no more drill-down.
    await gotoReady(page, "/employment");
    await expect(page.locator('[data-testid="employment-row"]').first()).toBeVisible();
    await page.keyboard.press("Enter"); // -> editor
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();

    await page.keyboard.press("/");
    // The vim engine's own in-buffer search opens instead — grep must NOT.
    await expect(overlay(page)).not.toBeVisible();
    await expect(page.locator('[data-testid="editor-mode"]')).toHaveText("/");

    await page.keyboard.press("Escape");
    await expect(page.locator('[data-testid="editor-mode"]')).toHaveText("NORMAL");
    // Esc only cancelled the in-buffer search — the editor itself, and the
    // browser view underneath it, are both untouched.
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();

    // Same must hold from VISUAL mode — "/" drops the selection back to
    // NORMAL and opens in-buffer search, never grep (a `/` that fell
    // through here would open grep ON TOP of the still-open editor, with no
    // keyboard path left to close it: the delegation flip only gives the
    // editor first refusal, not the only one).
    await page.keyboard.press("v");
    await expect(page.locator('[data-testid="editor-mode"]')).toHaveText("VISUAL");
    await page.keyboard.press("/");
    await expect(overlay(page)).not.toBeVisible();
    await expect(page.locator('[data-testid="editor-mode"]')).toHaveText("/");
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-testid="editor-mode"]')).toHaveText("NORMAL");
  });

  // The Employment `f`-filter this test covered no longer exists (Decision
  // 7, PLAN.md — dropped along with drill-down/`../` in the v2 rebuild).
  // Employment's own "editor gets
  // first refusal over grep" coverage is the test immediately above.

  test("overlay list row count matches this viewport's own computed fit", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    await expect(listEl(page)).toBeVisible();

    const expectedRows = await listEl(page).evaluate((el) => Math.max(4, Math.floor(el.clientHeight / 22)));
    await expect(rows(page)).toHaveCount(expectedRows);
  });

  // Regression coverage for the overlay's top rendering clipped.
  // Prior research couldn't reproduce it against the LEFT pane's "GREP ~"
  // title across 8 viewports; the actual culprit is the RIGHT preview
  // pane's own absolutely-positioned labels (`grep-file` / `grep-file-pos`,
  // both `top:-9px`, meant to straddle the pane's border the same way the
  // left title does) — that pane's container had `overflow:hidden`, which
  // clips a negative-offset absolutely-positioned child unconditionally, at
  // every viewport size (deterministic, not viewport-dependent — see the
  // fix's comment in GrepOverlay.svelte). `boundingBox()` alone can't catch
  // this: a clipped element still reports its full, correct layout rect
  // (clipping is a paint-time effect, not a layout one) — so the real
  // assertion walks every ancestor with non-"visible" overflow and checks
  // the label's rect is fully contained within each one's own rect, which
  // fails pre-fix and passes post-fix (and guards a future regression, e.g.
  // someone re-adding `overflow:hidden` to that container).
  /** Runs inside the page. Returns `null` when `id`'s element is fully
   * visible (inside the viewport, and inside every ancestor whose computed
   * overflow isn't "visible") or a human-readable reason string otherwise. */
  function clipCheck(id: string): string | null {
    const label = document.querySelector(`[data-testid="${id}"]`);
    if (!label) return "missing element";
    const labelRect = label.getBoundingClientRect();

    if (
      labelRect.top < 0 ||
      labelRect.left < 0 ||
      labelRect.bottom > window.innerHeight ||
      labelRect.right > window.innerWidth
    ) {
      return `outside the viewport: ${JSON.stringify(labelRect)}`;
    }

    let node = label.parentElement;
    while (node) {
      const style = getComputedStyle(node);
      if (style.overflowX !== "visible" || style.overflowY !== "visible") {
        const a = node.getBoundingClientRect();
        const EPS = 0.5;
        const contained =
          labelRect.left >= a.left - EPS &&
          labelRect.right <= a.right + EPS &&
          labelRect.top >= a.top - EPS &&
          labelRect.bottom <= a.bottom + EPS;
        if (!contained) {
          return `clipped by ${node.tagName}.${node.className} ${JSON.stringify(a)} vs label ${JSON.stringify(labelRect)}`;
        }
      }
      node = node.parentElement;
    }
    return null;
  }

  const EXTRA_VIEWPORTS = [
    { width: 1512, height: 945, deviceScaleFactor: 1 },
    { width: 1920, height: 1080, deviceScaleFactor: 1 },
    { width: 1366, height: 768, deviceScaleFactor: 1 },
    { width: 1280, height: 800, deviceScaleFactor: 2 },
    { width: 1512, height: 700, deviceScaleFactor: 1 }, // short viewport
  ];

  for (const vp of EXTRA_VIEWPORTS) {
    test.describe(`right preview pane labels are never clipped by an ancestor (item #14 fix) — ${vp.width}x${vp.height}@${vp.deviceScaleFactor}x`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor });

      test("grep-file / grep-file-pos fully contained in every clipping ancestor", async ({ page }) => {
        await gotoReady(page, "/");
        await page.keyboard.press("/");
        await expect(overlay(page)).toBeVisible();

        for (const testid of ["grep-file", "grep-file-pos"]) {
          const failure = await page.evaluate(clipCheck, testid);
          expect(failure, `${testid} at ${vp.width}x${vp.height}`).toBeNull();
        }
      });
    });
  }

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

// Behavioral e2e suite for the grep overlay (GrepOverlay.svelte), against
// the real-content build: every numeric assertion below is computed at
// test time from public/generated/grep-index.json via the same
// search()/formatCount() port the component itself uses
// (src/features/grep/lib/grep.ts), never hardcoded.
import { expect, test, type Page } from "../../../../../common/tests/ui/support/fixtures";
// This spec's `context` fixture (imported
// from ./fixtures.ts, not raw "@playwright/test") pre-seeds the boot-seen
// sessionStorage flag before every navigation, so BootSequence.svelte's
// ~4.6s unskippable sequence never runs for these tests — see that
// file's header comment for why this is a context-fixture override
// rather than a per-goto-helper change.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { search, formatCount, type RepoFile } from "../../../lib/grep";

const ROOT = join(import.meta.dirname, "../../../../../..");

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
const selectedRow = (page: Page) => page.locator('[data-testid="grep-row"][data-selected="true"]');

test.describe("Grep overlay", () => {
  test.beforeEach(async ({ page }) => {
    // Same network-determinism rule as the visual suite: Repositories' own
    // commit-refresh island fires on mount, so no test here should depend
    // on api.github.com's real availability.
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

  test("typing filters the results — 'grep.ts' finds src/features/grep/lib/grep.ts by path", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    await page.keyboard.type("grep.ts");
    await expect(queryText(page)).toContainText("grep.ts");
    await expect(rowByPath(page, "src/features/grep/lib/grep.ts")).toBeVisible();
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
    await page.keyboard.type('role: "Software Developer, Co-op"');
    await expect(selectedRow(page)).toHaveAttribute(
      "data-path",
      "src/features/employment/content/personnel/enaimco/software-developer/co-op/role.md",
    );
    await page.keyboard.press("Enter");
    await expect(overlay(page)).not.toBeVisible();
    // GrepOverlay's routing only switches the active VIEW (coarse, no deep
    // link), so `employment-preview` — unconditionally rendered by the
    // EmploymentRecords view — is the right-strength anchor here.
    await expect(page.locator('[data-testid="employment-preview"]')).toBeVisible();
  });

  test("Enter on a Repositories.svelte hit lands in the repositories view", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    // A path-fragment query (not a bare filename), prefixed with "src/" so
    // it stays unique to the real file's own path rather than matching
    // other files' prose mentions or relative-import literals of it.
    // Assembled at run time rather than written verbatim, for the same
    // reason the next test builds a run-time `nonceQuery`: this spec's own
    // source is indexed too, so a literal copy would out-rank the target.
    const REPOSITORIES_PATH = ["src", "features", "repositories", "components", "Repositories.svelte"].join("/");
    await page.keyboard.type(REPOSITORIES_PATH);
    // Wait for the filtered list to settle on the target's own row before
    // moving selection onto it — ArrowDown moves relative to whatever list
    // is on screen at the instant it's pressed, and typing is async.
    await expect(rowByPath(page, REPOSITORIES_PATH)).toBeVisible();
    // Two rows match this path — a common/tests/unit suite's own whitelist
    // test data sorts ahead of the real component — so this selects
    // explicitly with ArrowDown rather than assuming row 0.
    await page.keyboard.press("ArrowDown");
    await expect(selectedRow(page)).toHaveAttribute("data-path", REPOSITORIES_PATH);
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

  test("overlay list row count matches this viewport's own computed fit", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("/");
    await expect(listEl(page)).toBeVisible();

    const expectedRows = await listEl(page).evaluate((el) => Math.max(4, Math.floor(el.clientHeight / 22)));
    await expect(rows(page)).toHaveCount(expectedRows);
  });

  /** Runs inside the page; returns `null` when `id`'s element is fully
   * visible (in the viewport and every non-"visible"-overflow ancestor) or
   * a reason string otherwise. */
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
    test.describe(`right preview pane labels are never clipped by an ancestor — ${vp.width}x${vp.height}@${vp.deviceScaleFactor}x`, () => {
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

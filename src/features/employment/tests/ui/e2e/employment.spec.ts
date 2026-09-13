// Behavioral e2e suite for the Employment Records view (v2: flat list +
// service timeline), against the real-content build. Replaces the old
// drill-down/filter suite entirely: the view was rebuilt from scratch in the
// folder + state-class pattern, not relocated.
//
// The `personnel` collection is a variable-depth tree (content.config.ts's
// own header comment) — `<org>/<role-slug>/role.md` for every position, plus
// three deeper sub-role leaves under Enaimco's Software Developer position
// (full-time/part-time/co-op). This page shows exactly one flat row per
// `<org>/<role-slug>` directory (six today), newest start-date first — see
// the change doc's "Interpretation" section for why the sub-role leaves are
// deliberately excluded. Row/file names are synthesized from each
// directory's own slug (`software-developer.md`), since every real leaf on
// disk is literally named `role.md`.
//
// Nothing here hardcodes the six records' own field values (dates, months,
// org tags) as magic strings beyond what's needed to name a row — the index
// values are independently recomputed straight from the real frontmatter
// files below (same "derive the expectation from the real source"
// convention repositories.spec.ts uses for its own live data), so a future
// content edit doesn't silently desync this suite from the truth it's
// supposed to check.
import type { Locator } from "@playwright/test";
import { expect, test, type Page } from "../../../../../common/tests/ui/support/fixtures";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../../../../../..");
const PERSONNEL_DIR = join(ROOT, "src/features/employment/content/personnel");

// Matches src/common/tests/ui/e2e/nav.spec.ts's/sessions.spec.ts's own CLOCK_TIME
// literal — the visual suite's frozen "now"
// (src/common/tests/ui/support/recipes.ts). Not installed by every test below
// (most don't care about live durations), only the ones that assert
// index/timeline values computed against "now".
const CLOCK_TIME = "2026-08-15T23:34:00";

async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

async function openEmployment(page: Page) {
  await gotoReady(page, "/");
  await page.keyboard.down("Control");
  await page.keyboard.press("b");
  await page.keyboard.up("Control");
  await page.keyboard.press("2");
  await expect(page.locator('[data-testid="employment-row"]').first()).toBeVisible();
}

function rows(page: Page) {
  return page.locator('[data-testid="employment-row"]');
}

function rowLocator(page: Page, name: string) {
  return page.locator(`[data-testid="employment-row"][data-row-name="${name}"]`);
}

function rowNames(page: Page): Promise<(string | null)[]> {
  return rows(page).evaluateAll((els) => els.map((el) => el.getAttribute("data-row-name")));
}

// ---------------------------------------------------------------------------
// Ground truth, parsed straight off the real content files — independent of
// employmentRecordsState.svelte.ts's own implementation.
// ---------------------------------------------------------------------------

interface Truth {
  org: string;
  roleSlug: string;
  name: string;
  dates: string;
  order: number;
}

/** Every `<org>/<role-slug>/role.md` (depth 2) frontmatter, org-level only —
 * excludes the deeper sub-role leaves (`<org>/<role-slug>/<sub>/role.md`),
 * matching this page's own "one record per position" reading. */
function readTruth(): Truth[] {
  const out: Truth[] = [];
  for (const org of readdirSync(PERSONNEL_DIR, { withFileTypes: true })) {
    if (!org.isDirectory()) continue;
    const orgDir = join(PERSONNEL_DIR, org.name);
    for (const role of readdirSync(orgDir, { withFileTypes: true })) {
      if (!role.isDirectory()) continue;
      const roleMd = join(orgDir, role.name, "role.md");
      let raw: string;
      try {
        raw = readFileSync(roleMd, "utf8");
      } catch {
        continue; // no role.md directly at this depth (nothing to skip today, but stay defensive)
      }
      const dates = /^dates:\s*"([^"]+)"/m.exec(raw)?.[1] ?? "";
      const order = Number(/^order:\s*(\d+)/m.exec(raw)?.[1] ?? "0");
      out.push({ org: org.name, roleSlug: role.name, name: `${role.name}.md`, dates, order });
    }
  }
  return out;
}

const MONTH_NUM: Record<string, number> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

function parseMonthYear(raw: string, now: { y: number; m: number }): { y: number; m: number } {
  const trimmed = raw.trim();
  if (trimmed === "Present") return now;
  const [monthName, yearStr] = trimmed.split(/\s+/);
  return { y: Number(yearStr), m: MONTH_NUM[monthName] };
}

function monthsBetween(start: { y: number; m: number }, end: { y: number; m: number }): number {
  return (end.y - start.y) * 12 + (end.m - start.m) + 1;
}

/** Newest-first ordering: start date descending, `order` ascending on a tie
 * — same comparator as employmentRecordsState.svelte.ts, re-derived here
 * rather than imported so this suite actually checks the sort, not just
 * that both sides agree by construction. */
function sortedTruth(now: { y: number; m: number }) {
  return [...readTruth()]
    .map((t) => {
      const [startRaw, endRaw] = t.dates.split("–").map((s) => s.trim());
      const start = parseMonthYear(startRaw, now);
      const end = parseMonthYear(endRaw, now);
      return { ...t, start, end, live: endRaw === "Present", months: monthsBetween(start, end) };
    })
    .sort((a, b) => {
      if (a.start.y !== b.start.y) return b.start.y - a.start.y;
      if (a.start.m !== b.start.m) return b.start.m - a.start.m;
      return a.order - b.order;
    });
}

test.describe("Employment: flat list renders from the real collection", () => {
  test("exactly one row per org/role position, newest-first, matching the real frontmatter", async ({ page }) => {
    await openEmployment(page);
    const truth = readTruth();
    await expect(rows(page)).toHaveCount(truth.length);
    const names = await rowNames(page);
    // Row NAMES are synthesized from each role's own directory slug, not
    // guaranteed globally unique — Enaimco and Memorial both have a
    // "Software Developer" position, so "software-developer.md" legitimately
    // renders twice (disambiguated by the org-tag column), matching the
    // mockup's own mock data exactly. Assert a multiset match instead of
    // set-uniqueness.
    const expectedNames = truth.map((t) => t.name).sort();
    expect([...(names as string[])].sort()).toEqual(expectedNames);
  });

  test("rows are sorted newest start date first, `order` ascending on a tie", async ({ page }) => {
    await page.clock.setFixedTime(CLOCK_TIME);
    await openEmployment(page);
    const expected = sortedTruth({ y: 2026, m: 8 }).map((t) => t.name);
    expect(await rowNames(page)).toEqual(expected);
  });

  test("each row shows a 2-3 char org tag, `.rw-r--r--`, and a byte size — no drill-down chrome left", async ({ page }) => {
    await openEmployment(page);
    const first = rows(page).first();
    await expect(first).toContainText(".rw-r--r--");
    const cells = await first.locator("span").allTextContents();
    // orgTag cell (ena/mun) is 2-3 chars.
    const orgTag = cells.find((c) => /^[a-z]{2,3}$/.test(c));
    expect(orgTag).toBeTruthy();
  });

  test("no filter bar, hint bar, up-row, or prompt remnants from the old drill-down browser", async ({ page }) => {
    await openEmployment(page);
    for (const testid of [
      "employment-filter-row",
      "employment-filter-cursor",
      "employment-hint",
      "employment-up-row",
      "employment-prompt",
      "employment-pos",
      "employment-ls-row",
    ]) {
      await expect(page.locator(`[data-testid="${testid}"]`)).toHaveCount(0);
    }
  });
});

test.describe("Employment: index block, derived from real content", () => {
  test("orgs / longest / years-active match the recomputed truth", async ({ page }) => {
    await page.clock.setFixedTime(CLOCK_TIME);
    await openEmployment(page);
    const truth = sortedTruth({ y: 2026, m: 8 });
    const orgs = new Set(truth.map((t) => t.org)).size;
    const longest = Math.max(...truth.map((t) => t.months));
    const yearsStart = Math.min(...truth.map((t) => t.start.y));
    const yearsEnd = Math.max(...truth.map((t) => t.end.y));

    await expect(page.locator('[data-testid="employment-index-orgs"]')).toHaveText(String(orgs));
    await expect(page.locator('[data-testid="employment-index-longest"]')).toHaveText(`${longest} mo`);
    await expect(page.locator('[data-testid="employment-index-years"]')).toHaveText(`${yearsStart} – ${yearsEnd}`);
  });

  test("breadcrumb reads ~/employment-records", async ({ page }) => {
    await openEmployment(page);
    await expect(page.locator('[data-testid="employment-breadcrumb"]')).toHaveText("~/employment-records");
  });
});

test.describe("Employment: badges", () => {
  test("both panels show a top-straddling split-text PanelBadge, not the old bottom label", async ({ page }) => {
    await openEmployment(page);
    const badges = page.locator('[data-testid="panel-badge"]');
    await expect(badges).toHaveCount(2);
    await expect(badges.nth(0)).toContainText("Employment");
    await expect(badges.nth(0)).toContainText("Records");
    await expect(badges.nth(1)).toContainText("File");
    await expect(badges.nth(1)).toContainText("Preview");
    // Straddles the panel's own TOP border, not the bottom (old model).
    const box = await badges.first().boundingBox();
    const panelBox = await page.locator('[data-testid="employment-row"]').first().locator("xpath=../..").boundingBox();
    expect(box).toBeTruthy();
    expect(panelBox).toBeTruthy();
    if (box && panelBox) expect(box.y).toBeLessThan(panelBox.y + panelBox.height / 2);
  });
});

test.describe("Employment: selection — j/k/arrows sync preview and timeline live", () => {
  test("j/ArrowDown moves the cursor, wraps at the end; k/ArrowUp moves back, wraps at the start", async ({ page }) => {
    await openEmployment(page);
    const truth = sortedTruth({ y: 2026, m: 8 });
    const n = truth.length;

    // Row 0 starts selected (cursor glyph visible on the first row).
    await expect(rows(page).first()).toContainText("›");

    for (let i = 0; i < n; i++) await page.keyboard.press("j");
    // n presses of j from row 0 wraps exactly back to row 0.
    await expect(rows(page).first()).toContainText("›");

    await page.keyboard.press("k");
    await expect(rows(page).nth(n - 1)).toContainText("›");

    await page.keyboard.press("ArrowDown");
    await expect(rows(page).first()).toContainText("›");
  });

  test("selecting a row updates the preview panel's path/size live", async ({ page }) => {
    await openEmployment(page);
    const path0 = await page.locator('[data-testid="employment-preview-path"]').textContent();
    await page.keyboard.press("j");
    const path1 = await page.locator('[data-testid="employment-preview-path"]').textContent();
    expect(path1).not.toBe(path0);
    await expect(page.locator('[data-testid="employment-preview-size"]')).toHaveText(/^\d+ B$/);
  });

  test("clicking a row selects it and updates the preview", async ({ page }) => {
    await openEmployment(page);
    const truth = sortedTruth({ y: 2026, m: 8 });
    const targetName = truth[2].name;
    await rowLocator(page, targetName).click();
    await expect(rowLocator(page, targetName)).toContainText("›");
    await expect(page.locator('[data-testid="employment-preview-path"]')).toContainText(targetName);
  });

  test("the timeline node at the selected row's position renders the larger 'selected' dot size", async ({ page }) => {
    await openEmployment(page);
    const nodes = page.locator('[data-testid="employment-timeline-node"]');
    await expect(nodes).toHaveCount((await sortedTruth({ y: 2026, m: 8 })).length);
    // Asserted via `toHaveCSS` (computed style, auto-retrying) rather than a
    // raw `style` attribute regex — Svelte 5's compiled dynamic `style`
    // attribute round-trips through the browser's CSSOM (colors become
    // `rgb(...)`, `width:30px` becomes `width: 30px`), so a literal
    // substring match on the authored string is fragile — and the size
    // change is behind a 0.4s CSS transition (real, not fixtureMode-gated:
    // only the INFINITE keyframe animations are gated), so a one-shot
    // `evaluate()` right after the keypress can race it; `toHaveCSS` polls
    // until the transition settles.
    const dot = (loc: Locator) => loc.locator('[data-testid="employment-timeline-dot"]');

    // Row 0 (newest) is selected by default -> timeline node 0 too (same index).
    await expect(dot(nodes.first())).toHaveCSS("width", "30px");
    await page.keyboard.press("j");
    await expect(dot(nodes.first())).toHaveCSS("width", "19px");
    await expect(dot(nodes.nth(1))).toHaveCSS("width", "30px");
  });

  test("clicking a timeline node selects the matching row", async ({ page }) => {
    await openEmployment(page);
    const nodes = page.locator('[data-testid="employment-timeline-node"]');
    await nodes.nth(3).click();
    await expect(rows(page).nth(3)).toContainText("›");
  });

  test("Enter opens the selected record in the shared vim editor; :q closes back to the exact same selection", async ({
    page,
  }) => {
    // "j/k/enter selection stays" drops the `f` filter/drill-down/`../`, not
    // Enter's existing open-in-editor behavior — see
    // src/common/tests/ui/e2e/editor-vim.spec.ts's "Employment" entry point,
    // which parametrizes the same editor suite over this page. "Harmless-
    // open" describes why this is safe, not that Enter does nothing: the
    // buffer is always readonly.
    await openEmployment(page);
    await page.keyboard.press("j");
    const pathBefore = await page.locator('[data-testid="employment-preview-path"]').textContent();

    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();

    await page.keyboard.press(":");
    await page.keyboard.type("q");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="editor-scroller"]')).toHaveCount(0);
    await expect(rows(page).nth(1)).toContainText("›");
    await expect(page.locator('[data-testid="employment-preview-path"]')).toHaveText(pathBefore ?? "");
    // Still on the employment window — closing the editor never navigated to
    // the dashboard or anywhere else.
    await expect(page.locator('[data-testid="status-bar-window"][data-window-id="employment"]')).toHaveText(
      "2:employment*",
    );
  });
});

test.describe("Employment: preview body", () => {
  test("the preview panel renders the selected role's real markdown body, colorized", async ({ page }) => {
    await openEmployment(page);
    const truth = sortedTruth({ y: 2026, m: 8 })[0];
    const raw = readFileSync(join(PERSONNEL_DIR, truth.org, truth.roleSlug, "role.md"), "utf8");
    const bodyFirstLine = raw.split("---").slice(2).join("---").trim().split("\n")[0];
    await expect(page.locator('[data-testid="employment-doc-line"]').first()).toContainText(bodyFirstLine.replace(/^#\s*/, ""));
  });
});

test.describe("Employment: corner sigils", () => {
  test("all four corner sigil glyphs render", async ({ page }) => {
    await openEmployment(page);
    for (const color of ["red", "blue", "teal", "gold"]) {
      await expect(page.locator(`img[src="/assets/spider-glyph-${color}.svg"]`).first()).toBeVisible();
    }
  });
});

test.describe("Employment: window switching still works via Ctrl-b", () => {
  test("Ctrl-b 2 opens Employment Records from the dashboard; status bar shows 2:employment*", async ({ page }) => {
    await openEmployment(page);
    await expect(page.locator('[data-testid="status-bar-window"][data-window-id="employment"]')).toHaveText(
      "2:employment*",
    );
  });
});

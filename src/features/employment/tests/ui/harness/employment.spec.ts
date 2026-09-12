// Harness spec — proves EmploymentRecords.svelte itself works, mounted
// alone (no Terminal kernel, no tmux chrome, no PaneTree-owned focus/refs
// routing) against `/harness/employment` (fixture build only, seeded
// fixture props via EmploymentHarness.svelte — see that wrapper's own
// header comment for the one piece of Terminal/PaneTree keydown routing it
// reproduces).
//
// Deliberately NOT a copy of
// src/features/employment/tests/ui/e2e/employment.spec.ts: that suite
// exercises this view through the real kernel and the real content tree
// (window switching, live tmux focus) — this file mounts standalone
// against the FIXTURE personnel tree
// (src/features/employment/tests/ui/support/personnel, self-switched by
// content.config.ts's own `base:` ternary under PORTFOLIO_FIXTURES=1) and
// covers exactly: mount + row rendering, click-selection updating the
// preview/timeline, j/k cursor movement, and Enter opening the editor — the
// feature's own core interactions, independent of the kernel.
//
// Row count/order is derived from the real fixture tree on disk (same
// "derive the expectation from the real source" convention the ported e2e
// suite uses for the real tree), not hardcoded, so a future fixture edit
// doesn't silently desync this suite from the truth it's supposed to check.
// Assertions are web-first throughout (Mechanics 5b, playwright.md R002) —
// no `page.evaluate`/CSS-selector reads as the assertion itself, only as an
// input deriving an expected value fed into a `toHaveText`/`toHaveCount`.
import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { EmploymentPage } from "../pages/EmploymentPage";

const PERSONNEL_DIR = join(import.meta.dirname, "../support/personnel");

interface Truth {
  name: string;
  start: { y: number; m: number };
  order: number;
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

/** Every `<org>/<role-slug>/role.md` (depth 2) frontmatter under the
 * fixture tree, org-level only — excludes oscorp's deeper
 * co-op/full-time/part-time sub-role leaves, matching
 * EmploymentRecordsState's own "one record per position" reading
 * (`dirSegmentsOf().length === 2`). */
function readTruth(): Truth[] {
  const out: Truth[] = [];
  for (const org of readdirSync(PERSONNEL_DIR, { withFileTypes: true })) {
    if (!org.isDirectory()) continue;
    const orgDir = join(PERSONNEL_DIR, org.name);
    for (const role of readdirSync(orgDir, { withFileTypes: true })) {
      if (!role.isDirectory()) continue;
      let raw: string;
      try {
        raw = readFileSync(join(orgDir, role.name, "role.md"), "utf8");
      } catch {
        continue;
      }
      const dates = /^dates:\s*"([^"]+)"/m.exec(raw)?.[1] ?? "";
      const order = Number(/^order:\s*(\d+)/m.exec(raw)?.[1] ?? "0");
      const [startRaw] = dates.split("–").map((s) => s.trim());
      const [monthName, yearStr] = startRaw.split(/\s+/);
      out.push({ name: `${role.name}.md`, start: { y: Number(yearStr), m: MONTH_NUM[monthName] }, order });
    }
  }
  return out;
}

/** Newest-first: start date descending, `order` ascending on a tie — same
 * comparator as employmentRecordsState.svelte.ts, re-derived here rather
 * than imported so this suite actually checks the sort. */
const sortedTruth = [...readTruth()].sort((a, b) => {
  if (a.start.y !== b.start.y) return b.start.y - a.start.y;
  if (a.start.m !== b.start.m) return b.start.m - a.start.m;
  return a.order - b.order;
});

test.describe("Employment harness: mounts standalone with seeded fixture props", () => {
  test("one row renders per org/role position from the fixture personnel tree, newest-first", async ({ page }) => {
    const employment = new EmploymentPage(page);
    await employment.openHarness();

    await expect(employment.rows).toHaveCount(sortedTruth.length);
    await expect(employment.rows.first()).toHaveAttribute("data-row-name", sortedTruth[0].name);
    await expect(employment.rows.last()).toHaveAttribute("data-row-name", sortedTruth.at(-1)!.name);
  });

  test("clicking a row selects it and updates the preview panel's path", async ({ page }) => {
    const employment = new EmploymentPage(page);
    await employment.openHarness();

    const targetIndex = 2;
    await employment.rows.nth(targetIndex).click();
    await expect(employment.rows.nth(targetIndex)).toHaveAttribute("data-selected", "");
    await expect(employment.previewPath).toContainText(sortedTruth[targetIndex].name);
  });

  test("clicking a timeline node selects the matching row", async ({ page }) => {
    const employment = new EmploymentPage(page);
    await employment.openHarness();

    await employment.timelineNodes.nth(3).click();
    await expect(employment.rows.nth(3)).toHaveAttribute("data-selected", "");
  });

  test("j/ArrowDown moves the cursor forward; k/ArrowUp moves it back", async ({ page }) => {
    const employment = new EmploymentPage(page);
    await employment.openHarness();

    await expect(employment.rows.first()).toHaveAttribute("data-selected", "");
    await employment.pressKey("j");
    await expect(employment.rows.nth(1)).toHaveAttribute("data-selected", "");
    await employment.pressKey("k");
    await expect(employment.rows.first()).toHaveAttribute("data-selected", "");
  });

  test("Enter opens the selected record in the shared vim editor", async ({ page }) => {
    const employment = new EmploymentPage(page);
    await employment.openHarness();

    await expect(employment.editorScroller).toHaveCount(0);
    await employment.pressKey("Enter");
    await expect(employment.editorScroller).toBeVisible();
  });

  test("no Terminal kernel chrome mounts alongside it (no status bar, no window switching)", async ({ page }) => {
    const employment = new EmploymentPage(page);
    await employment.openHarness();

    await expect(employment.statusBar.windows).toHaveCount(0);
  });
});

// This suite runs against the real build (E2E_EXPECT_FIXTURES=0), not the fixture tree, so the clipping and scroll assertions exercise real content that actually overflows.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "../../../../../common/tests/ui/support/fixtures";

const ROOT = join(import.meta.dirname, "../../../../../..");
const PERSONNEL_DIR = join(ROOT, "src/features/employment/content/personnel");
const PERSONNEL_YAML = readFileSync(
  join(ROOT, "src/features/employment/content/personnel.yaml"),
  "utf8",
);

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

/** `orgTags` in src/features/employment/content/personnel.yaml is
 * hand-authored (not mechanically derivable from the directory slug —
 * that file's own header comment), so this reads it back rather than
 * hardcoding "ena"/"mun" here. */
function orgTagFor(org: string): string {
  const re = new RegExp(`^\\s*${org}:\\s*(\\S+)`, "m");
  return re.exec(PERSONNEL_YAML)?.[1] ?? org.slice(0, 3);
}

/** The real `<org>/<role-slug>/role.md` (depth 2 — same "one record per
 * position" reading employment.spec.ts's own readTruth() uses) whose body
 * contains the single longest line across the whole collection. */
function longestRecord(): { name: string; orgTag: string } {
  let best = { org: "", roleSlug: "", len: -1 };
  for (const org of readdirSync(PERSONNEL_DIR, { withFileTypes: true })) {
    if (!org.isDirectory()) continue;
    const orgDir = join(PERSONNEL_DIR, org.name);
    for (const role of readdirSync(orgDir, { withFileTypes: true })) {
      if (!role.isDirectory()) continue;
      let raw: string;
      try {
        raw = readFileSync(join(orgDir, role.name, "role.md"), "utf8");
      } catch {
        continue; // no role.md directly at this depth
      }
      const body = raw.split("---").slice(2).join("---");
      const maxLine = Math.max(...body.split("\n").map((l) => l.length));
      if (maxLine > best.len) best = { org: org.name, roleSlug: role.name, len: maxLine };
    }
  }
  return { name: `${best.roleSlug}.md`, orgTag: orgTagFor(best.org) };
}

function rowFor(page: Page, name: string, orgTag: string) {
  return page
    .locator(`[data-testid="employment-row"][data-row-name="${name}"]`)
    .filter({ hasText: orgTag });
}

test.describe("Employment: left panel is top-stacked, no bottom-anchored void", () => {
  test("breadcrumb sits close to the first row; the row list is not pushed to the panel's bottom edge", async ({
    page,
  }) => {
    await openEmployment(page);
    const breadcrumb = await page.locator('[data-testid="employment-breadcrumb"]').boundingBox();
    const firstRow = await page.locator('[data-testid="employment-row"]').first().boundingBox();
    const lastRow = await page.locator('[data-testid="employment-row"]').last().boundingBox();
    const box = await page
      .locator('[data-testid="employment-records-list"]')
      .locator("xpath=..")
      .boundingBox();
    expect(breadcrumb && firstRow && lastRow && box).toBeTruthy();
    if (!breadcrumb || !firstRow || !lastRow || !box) return;

    const gapAboveFirstRow = firstRow.y - (breadcrumb.y + breadcrumb.height);
    expect(gapAboveFirstRow).toBeLessThan(40);

    const gapBelowLastRow = box.y + box.height - (lastRow.y + lastRow.height);
    expect(gapBelowLastRow).toBeGreaterThanOrEqual(80);
  });
});

test.describe("Employment: no line is clipped horizontally (the preview panel's width itself is constant)", () => {
  test("the preview panel's own width is constant across every record at 1470x842", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1470, height: 842 });
    await openEmployment(page);
    const rows = page.locator('[data-testid="employment-row"]');
    const n = await rows.count();
    const widths: number[] = [];
    for (let i = 0; i < n; i++) {
      await rows.nth(i).click();
      const box = await page.locator('[data-testid="employment-preview"]').boundingBox();
      expect(box).toBeTruthy();
      if (box) widths.push(box.width);
    }
    expect(new Set(widths).size).toBe(1);
  });

  test("every doc line's own text span fits its available width — no line is truncated", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1470, height: 842 });
    await openEmployment(page);
    const rec = longestRecord();
    await rowFor(page, rec.name, rec.orgTag).click();

    const spans = page.locator('[data-testid="employment-doc-line"] span:nth-child(2)');
    const count = await spans.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const metrics = await spans
        .nth(i)
        .evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
    }
  });
});

test.describe("Employment: the row list and preview scroll when content overflows", () => {
  test.beforeEach(async ({ page }) => {
    // A short viewport leaves too little vertical room for the row list or the longest real record's body to fit without scrolling.
    await page.setViewportSize({ width: 1470, height: 340 });
  });

  test("both containers declare overflow-y:auto", async ({ page }) => {
    await openEmployment(page);
    for (const testid of ["employment-records-list", "employment-preview"]) {
      const overflowY = await page
        .locator(`[data-testid="${testid}"]`)
        .evaluate((el) => getComputedStyle(el).overflowY);
      expect(overflowY).toBe("auto");
    }
  });

  test("the row list overflows and the mouse wheel scrolls it", async ({ page }) => {
    await openEmployment(page);
    const list = page.locator('[data-testid="employment-records-list"]');
    const metrics = await list.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

    const before = await list.evaluate((el) => el.scrollTop);
    const box = await list.boundingBox();
    expect(box).toBeTruthy();
    if (!box) return;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(before);
  });

  test("the preview overflows for the longest real record and the mouse wheel scrolls it", async ({
    page,
  }) => {
    await openEmployment(page);
    const rec = longestRecord();
    await rowFor(page, rec.name, rec.orgTag).click();

    const preview = page.locator('[data-testid="employment-preview"]');
    const metrics = await preview.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

    const before = await preview.evaluate((el) => el.scrollTop);
    const box = await preview.boundingBox();
    expect(box).toBeTruthy();
    if (!box) return;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => preview.evaluate((el) => el.scrollTop)).toBeGreaterThan(before);
  });
});

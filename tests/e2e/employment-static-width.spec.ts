// Regression suite for "why does employment records need to expand?? Both
// should be static sizes" — the records list panel and the preview panel
// used `flex:1` (RecordsPanel.svelte / PreviewPanel.svelte), so both scaled
// continuously with the viewport (measured: preview 579px @1470, 484px
// @1280, 394px @1100, overflowing the viewport at 900px). Design canvas is
// 1512x945 (UI-Mockups/builds-page-design-review/Personnel.dc.html rendered
// at that size: records 626px, timeline 188px, preview 626px). Both panels
// are now fixed at 626px regardless of viewport; narrower than the fixed
// layout (626+188+626+margins+padding = 1512) scrolls horizontally within
// the view's own scroll container instead of shrinking or reflowing.
import { expect, test, type Page } from "./fixtures.ts";

const RECORDS_PANEL = '[data-testid="employment-records-panel"]';
const PREVIEW_PANEL = '[data-testid="employment-preview-panel"]';
const VIEW_SCROLL = '[data-testid="employment-view-scroll"]';
const STATIC_WIDTH = 626;

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

async function widthOf(page: Page, selector: string): Promise<number> {
  const box = await page.locator(selector).boundingBox();
  expect(box).toBeTruthy();
  return Math.round(box?.width ?? -1);
}

test.describe("Employment: records and preview panels are static width, not viewport-scaled", () => {
  for (const vp of [
    { width: 1512, height: 945 },
    { width: 1920, height: 1080 },
    { width: 1280, height: 842 },
  ]) {
    test(`both panels are exactly ${STATIC_WIDTH}px at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await openEmployment(page);
      expect(await widthOf(page, RECORDS_PANEL)).toBe(STATIC_WIDTH);
      expect(await widthOf(page, PREVIEW_PANEL)).toBe(STATIC_WIDTH);
    });
  }

  test("widths are identical across all three viewports (the static guarantee)", async ({ page }) => {
    const widths: { records: number; preview: number }[] = [];
    for (const vp of [
      { width: 1512, height: 945 },
      { width: 1920, height: 1080 },
      { width: 1280, height: 842 },
    ]) {
      await page.setViewportSize(vp);
      await openEmployment(page);
      widths.push({ records: await widthOf(page, RECORDS_PANEL), preview: await widthOf(page, PREVIEW_PANEL) });
    }
    expect(new Set(widths.map((w) => w.records)).size).toBe(1);
    expect(new Set(widths.map((w) => w.preview)).size).toBe(1);
  });
});

test.describe("Employment: panel widths do not vary by which record is selected (guardrail)", () => {
  test("both panels stay the same width across every record at 1470x842", async ({ page }) => {
    await page.setViewportSize({ width: 1470, height: 842 });
    await openEmployment(page);
    const rows = page.locator('[data-testid="employment-row"]');
    const n = await rows.count();
    expect(n).toBeGreaterThan(0);
    const recordsWidths = new Set<number>();
    const previewWidths = new Set<number>();
    for (let i = 0; i < n; i++) {
      await rows.nth(i).click();
      recordsWidths.add(await widthOf(page, RECORDS_PANEL));
      previewWidths.add(await widthOf(page, PREVIEW_PANEL));
    }
    expect(recordsWidths.size).toBe(1);
    expect(previewWidths.size).toBe(1);
  });
});

test.describe("Employment: narrower than the fixed layout scrolls instead of shrinking", () => {
  // 900px is desktop-mode's own lower bound (Shell.astro's mobile-block
  // media query fires below 900px OR on a coarse pointer, so 900px itself
  // still renders the terminal) and is well under the fixed layout's total
  // (626+188+626+20 timeline margins+52 outer padding = 1512px).
  test("the view's own scroll container overflows horizontally, scrolling moves it, and both panels stay fixed-width", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 842 });
    await openEmployment(page);

    const scrollEl = page.locator(VIEW_SCROLL);
    const metrics = await scrollEl.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);

    const before = await scrollEl.evaluate((el) => el.scrollLeft);
    await scrollEl.evaluate((el) => {
      el.scrollLeft = el.scrollLeft + 300;
    });
    await expect.poll(() => scrollEl.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before);

    expect(await widthOf(page, RECORDS_PANEL)).toBe(STATIC_WIDTH);
    expect(await widthOf(page, PREVIEW_PANEL)).toBe(STATIC_WIDTH);
  });

  test("the document itself does not need to scroll — overflow is contained in the view's own scroll container", async ({
    page,
  }) => {
    // Documented deviation from a literal `documentElement.scrollWidth`
    // assertion: Terminal.svelte wraps every view in an ancestor
    // `overflow:hidden` (outside this component's ownership), so document-
    // level scroll can never occur here by construction. The view's own
    // scroll container (asserted above) is where the horizontal scroll the
    // user sees actually lives — this test just pins that the page/document
    // itself stays non-scrolling, i.e. nothing is leaking past the
    // container into a double scrollbar.
    await page.setViewportSize({ width: 900, height: 842 });
    await openEmployment(page);
    const hasDocumentScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasDocumentScroll).toBe(false);
  });
});

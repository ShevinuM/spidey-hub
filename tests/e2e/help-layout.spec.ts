// Permanent regression coverage for the Help page's "no row ever wraps"
// rule (a locked layout requirement, not just a Mockup A style choice):
// every row's name, description, and key chips render on exactly one line
// at both of the viewports this closes the user's clipped-title bug for.
// HelpView.svelte enforces this with `white-space:nowrap` on each of those
// three pieces plus `flex-wrap:nowrap` on the chip row — this spec proves
// that CSS actually holds by measuring scrollWidth vs clientWidth (nowrap
// turns "would have wrapped" into "overflows its box instead", so this
// single check catches both wrapping AND truncation/overflow in one go)
// and confirming every row renders at the same height (rows are two lines
// tall by design — name over description — not one).
import { expect, test, type Page } from "../../common/tests/ui/support/fixtures.ts";

const VIEWPORTS = [
  { width: 1512, height: 945 },
  { width: 1920, height: 1080 },
];

async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

/** True if the element's content overflows its own box on either axis —
 * the only way `white-space:nowrap` content can misbehave once wrapping
 * itself is impossible. Not used for the key-chips container: its chips
 * are `transform:skewX(...)`, and Chromium's scrollable-overflow region
 * includes a transformed descendant's SHEARED (visually wider) bounds even
 * though nothing actually wraps or clips — a false positive from this
 * measurement, not a real layout bug (see `chipsOnOneLine` below for the
 * transform-agnostic check used there instead). */
async function overflows(locator: ReturnType<Page["locator"]>): Promise<boolean> {
  const handles = await locator.elementHandles();
  for (const handle of handles) {
    const bad = await handle.evaluate((el: Element) => el.scrollWidth > el.clientWidth + 1);
    if (bad) return true;
  }
  return false;
}

/** True only if every chip inside every matched keys-container sits at the
 * same vertical position as its siblings — the direct, transform-agnostic
 * proof that `flex-wrap:nowrap` actually held (chips never wrapped to a
 * second line), independent of the skewed chips' visual bounds. */
async function chipsAllOnOneLine(locator: ReturnType<Page["locator"]>): Promise<boolean> {
  const handles = await locator.elementHandles();
  for (const handle of handles) {
    const ok = await handle.evaluate((el: Element) => {
      const tops = Array.from(el.children).map((c) => c.getBoundingClientRect().top);
      if (tops.length === 0) return true;
      return tops.every((t) => Math.abs(t - tops[0]) < 1);
    });
    if (!ok) return false;
  }
  return true;
}

for (const viewport of VIEWPORTS) {
  test.describe(`Help layout: no wrapping/clipping at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test("header title is not clipped", async ({ page }) => {
      await gotoReady(page, "/help");
      expect(await overflows(page.locator('[data-testid="help-title"]'))).toBe(false);
    });

    test("every row's name, description, and key chips render on one line, with no overflow", async ({ page }) => {
      await gotoReady(page, "/help");

      const rowCount = await page.locator('[data-testid="help-row"]').count();
      expect(rowCount).toBeGreaterThan(0);

      expect(await overflows(page.locator('[data-testid="help-row-name"]'))).toBe(false);
      expect(await overflows(page.locator('[data-testid="help-row-desc"]'))).toBe(false);
      expect(await chipsAllOnOneLine(page.locator('[data-testid="help-row-keys"]'))).toBe(true);
    });

    test("every row renders at the same (single-line-pair) height", async ({ page }) => {
      await gotoReady(page, "/help");

      const heights = await page.locator('[data-testid="help-row"]').evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect().height),
      );
      expect(heights.length).toBeGreaterThan(0);
      const uniform = heights[0];
      for (const h of heights) {
        expect(Math.abs(h - uniform)).toBeLessThan(1);
      }
    });

    test("the page never scrolls horizontally", async ({ page }) => {
      await gotoReady(page, "/help");
      const hasHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(hasHorizontalScroll).toBe(false);
    });
  });
}

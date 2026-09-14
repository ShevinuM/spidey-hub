// Functional (non-golden) coverage proving the adversarial fixture actually exercises the defect class it exists to catch.
//
// A tidy, fixed-length fixture dataset could pass every golden while a
// panel silently failed to scroll or clipped a long line.
//
// Fixture data under test (src/content.config.ts,
// src/features/employment/tests/ui/support/personnel/):
//   - `damage-control/evidence-cataloguer` — a ~300-line employment record
//     (the newest-dated, so it's row 0/the default selection) with an
//     embedded 400-char unbroken (no-space) line.
//
// These helpers (`gotoReady`, `prefixDigit`, `fitsWithin`) are
// deliberately duplicated verbatim into repositories' own
// adversarial-fixtures.spec.ts rather than extracted into a shared
// support module, the rewrite-the-safety-net hazard this repo's
// test-infra rules exist to prevent.
import { expect, test, type Page } from "@playwright/test";
import { BOOT_SEEN_STORAGE_KEY } from "../../../../../common/tests/ui/support/fixtures";

/** Same boot-skip contract src/common/tests/ui/support/pipeline.mjs's `captureState()`
 * uses (pre-seed via `addInitScript`, before any navigation) — this file
 * has no golden/clock determinism needs, only the boot-skip. */
async function gotoReady(page: Page, path: string): Promise<string[]> {
  await page.addInitScript(
    (key) => {
      try {
        sessionStorage.setItem(key, "1");
      } catch {
        // best-effort, same contract as src/features/boot/lib/boot-state.ts
      }
    },
    BOOT_SEEN_STORAGE_KEY,
  );
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(path);
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
  // Self-guard against a future playwright-config refactor silently defeating check-fixture-flag.ts's server-side gate — this asserts fixture mode per-test too.
  await expect(page.locator("html")).toHaveAttribute("data-fixture-mode", "true");
  return pageErrors;
}

async function prefixDigit(page: Page, digit: string) {
  await page.keyboard.down("Control");
  await page.keyboard.press("b");
  await page.keyboard.up("Control");
  await page.keyboard.press(digit);
}

/** True if `box` fits within `container`'s width, i.e. text wrapped rather than overflowing — deliberately compares the leaf span's own rendered box against its container, never a container against itself, since an ancestor with `text-overflow:ellipsis` can absorb overflow internally and still report a "fine" scrollWidth/clientWidth pair while its content is visually clipped. */
function fitsWithin(box: { width: number }, container: { width: number }, slack = 2): boolean {
  return box.width <= container.width + slack;
}

test.describe("adversarial fixtures — employment", () => {
  test("the ~300-line evidence-cataloguer record's preview genuinely scrolls", async ({ page }) => {
    const errors = await gotoReady(page, "/");
    await prefixDigit(page, "2");
    const firstRow = page.locator('[data-testid="employment-row"]').first();
    await expect(firstRow).toHaveAttribute("data-row-name", "evidence-cataloguer.md");

    const preview = page.locator('[data-testid="employment-preview"]');
    await expect(preview).toBeVisible();

    const viewportSize = page.viewportSize();
    const previewBox = (await preview.boundingBox())!;
    expect(viewportSize).not.toBeNull();
    expect(previewBox.x + previewBox.width).toBeLessThanOrEqual(viewportSize!.width + 2);

    const { scrollHeight, clientHeight, scrollTop: initialScrollTop } = await preview.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollTop: el.scrollTop,
    }));
    expect(scrollHeight).toBeGreaterThan(clientHeight);
    expect(initialScrollTop).toBe(0);

    await preview.evaluate((el) => {
      el.scrollTop = 200;
    });
    const movedScrollTop = await preview.evaluate((el) => el.scrollTop);
    expect(movedScrollTop).toBeGreaterThan(0);

    expect(errors).toEqual([]);
  });

  test("the record's embedded 400-char line wraps across multiple visual lines instead of clipping", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await prefixDigit(page, "2");

    const lines = page.locator('[data-testid="employment-doc-line"]');
    // A short, ordinary line (line 1 of the body, "# Evidence Cataloguer")
    // as the single-line-height baseline.
    const baselineHeight = await lines.nth(0).evaluate((el) => el.getBoundingClientRect().height);

    const longLine = lines.filter({ hasText: "0123456789abcdef0123456789abcdef" }).first();
    await expect(longLine).toBeVisible();
    const longLineBox = (await longLine.boundingBox())!;
    const containerBox = (await page.locator('[data-testid="employment-preview"]').boundingBox())!;

    expect(fitsWithin(longLineBox, containerBox)).toBe(true);
    // Height is the discriminator width alone can't provide: a genuinely wrapped 400-char line occupies several line boxes and is much taller than a single ordinary line, while a clipped one-liner would stay ~baselineHeight regardless of content length.
    expect(longLineBox.height).toBeGreaterThan(baselineHeight * 1.5);
  });
});

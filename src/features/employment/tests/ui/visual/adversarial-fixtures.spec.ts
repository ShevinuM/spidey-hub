// Functional (non-golden) coverage for employment's adversarial fixture
// data. src/features/employment/tests/ui/visual/identical.spec.ts proves
// goldens stay pixel-stable; this file proves the ADVERSARIAL fixture added
// alongside them actually exercises the defect class it exists to catch —
// a tidy, fixed-length fixture dataset could pass every golden while a
// panel silently failed to scroll or clipped a long line. No PNG comparisons here,
// so this file has no `tests/ui/visual/goldens/` entries of its own — it's
// wired into `pnpm test:visual` in package.json purely so it always runs
// against the fixture build, same port-4322 server (playwright.config.ts)
// `identical.spec.ts` uses.
//
// Fixture data under test (src/content.config.ts,
// src/features/employment/tests/ui/support/personnel/):
//   - `damage-control/evidence-cataloguer` — a ~300-line employment record
//     (the newest-dated, so it's row 0/the default selection) with an
//     embedded 400-char unbroken (no-space) line.
//
// These helpers (`gotoReady`, `prefixDigit`, `fitsWithin`) are deliberately
// duplicated verbatim into this file and into
// src/features/repositories/tests/ui/visual/adversarial-fixtures.spec.ts —
// extracting them into a shared support module is the rewrite-the-safety-net
// hazard this repo's test-infra rules exist to prevent; both halves keep
// their own copy.
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
  // Self-guard: fail loudly if this ever runs against the real build
  // instead of the fixture build (E2E_EXPECT_FIXTURES/checkFixtureFlag.ts
  // already gates the SERVER, but a per-test assert here means a future
  // refactor of the playwright config can't silently defeat that gate for
  // this file specifically).
  await expect(page.locator("html")).toHaveAttribute("data-fixture-mode", "true");
  return pageErrors;
}

async function prefixDigit(page: Page, digit: string) {
  await page.keyboard.down("Control");
  await page.keyboard.press("b");
  await page.keyboard.up("Control");
  await page.keyboard.press(digit);
}

/** True if `box` fits within `container`'s width, i.e. text wrapped rather
 * than overflowing past its container. Deliberately compares the LEAF
 * span's own rendered box against its container — never a container
 * against itself, which the plan/checklist calls out as vacuous: an
 * ancestor with `text-overflow:ellipsis` absorbs overflow internally, so
 * the ancestor's own scrollWidth/clientWidth pair can look "fine" even
 * while its content is visually clipped. */
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

    // Guards against the exact defect class this record caught during
    // authoring: `overflow-wrap:break-word` on the doc-line span let a
    // single unbroken 400-char line grow this panel's flex ancestors wide
    // enough to push the WHOLE 3-panel row off-screen to the right —
    // `toBeVisible()`/scroll-metric checks alone still passed in that
    // broken state (both sides of the ratio grew together), so this
    // compares against the actual viewport, not just this panel's own
    // container.
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

    // Width: the wrapped line's own rendered row must fit inside its
    // scroll container — a clipped/overflowing row would report a width
    // far wider than the container.
    expect(fitsWithin(longLineBox, containerBox)).toBe(true);
    // Height: the discriminator a width check alone can't provide (see
    // this file's `fitsWithin` comment) — a genuinely wrapped 400-char
    // line occupies several line boxes, so its row is much taller than a
    // single ordinary line; a clipped one-liner would stay ~baselineHeight
    // regardless of content length.
    expect(longLineBox.height).toBeGreaterThan(baselineHeight * 1.5);
  });
});

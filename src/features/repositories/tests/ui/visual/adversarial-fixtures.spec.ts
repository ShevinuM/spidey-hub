// Proves the adversarial fixtures actually exercise their defect classes (an unwrapped long line, an empty repo) rather than merely looking fine in a golden — no PNG comparisons here, so this file has no goldens of its own.
// Fixture data under test: flerken-watch.md's 400-char unbroken line (via the all-projects preview), and webbing-lab's ready-but-empty repo index (no files, no commits snapshot).
// gotoReady/prefixDigit/fitsWithin are deliberately duplicated verbatim in employment's own adversarial-fixtures.spec.ts rather than extracted into a shared module, per this repo's test-infra rules against shared-helper fragility.
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
  // Self-guard: asserts fixture mode directly, so a future playwright.config change can't silently defeat E2E_EXPECT_FIXTURES' server-side gate for this file.
  await expect(page.locator("html")).toHaveAttribute("data-fixture-mode", "true");
  return pageErrors;
}

async function prefixDigit(page: Page, digit: string) {
  await page.keyboard.down("Control");
  await page.keyboard.press("b");
  await page.keyboard.up("Control");
  await page.keyboard.press(digit);
}

/** True if `box` fits within `container`'s width — deliberately compares the leaf span's own box against its container, never a container against itself, since an ellipsis-absorbing ancestor can look fine while its content is clipped. */
function fitsWithin(box: { width: number }, container: { width: number }, slack = 2): boolean {
  return box.width <= container.width + slack;
}

test.describe("adversarial fixtures — repositories", () => {
  test("flerken-watch.md's 400-char trace line wraps in the Content panel instead of clipping", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await prefixDigit(page, "1");

    // All-projects tree is the default selection/mount state — no click
    // needed to reach it (see
    // src/features/repositories/tests/ui/e2e/repositories.spec.ts).
    await page.locator('[data-testid="repositories-tree-row"][data-entry-name="flerken-watch.md"]').click();

    const previewLines = page.locator('[data-testid="repositories-preview-line"]');
    await expect(previewLines.first()).toBeVisible();
    const baselineHeight = await previewLines.nth(0).evaluate((el) => el.getBoundingClientRect().height);

    const longLine = previewLines.filter({ hasText: /^0123456789abcdef/ }).first();
    await expect(longLine).toBeVisible();
    const longLineBox = (await longLine.boundingBox())!;
    const containerBox = (await page.locator('[data-testid="repositories-changes-body"]').boundingBox())!;

    expect(fitsWithin(longLineBox, containerBox)).toBe(true);
    expect(longLineBox.height).toBeGreaterThan(baselineHeight * 1.5);
  });

  test("an empty repository (no files, no commits) renders its empty state without throwing", async ({
    page,
  }) => {
    const errors = await gotoReady(page, "/");
    await prefixDigit(page, "1");

    await page.locator('[data-testid="repositories-repo-row"][data-repo-name="webbing-lab"]').click();

    const filesCaption = page.locator('[data-testid="repositories-files-caption"]');
    await expect(filesCaption).toContainText("webbing-lab");

    // Zero file rows and zero commit rows render gracefully — no error text, no thrown exception (a `ready`, empty index, not the network-error path).
    await expect(page.locator('[data-testid="repositories-tree-row"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="repositories-commit-row"]')).toHaveCount(0);

    expect(errors).toEqual([]);
  });
});

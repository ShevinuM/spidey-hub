// Regression suite for the Employment Records view's left row-list panel:
// a bottom-anchored void used to open up between the breadcrumb and the
// first row, pushing the whole list toward the panel's bottom edge instead
// of stacking it under the breadcrumb.
import { expect, test, type Page } from "./fixtures.ts";

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

test.describe("Employment: left panel is top-stacked, no bottom-anchored void", () => {
  test("breadcrumb sits close to the first row; the row list is not pushed to the panel's bottom edge", async ({
    page,
  }) => {
    await openEmployment(page);
    const breadcrumb = await page.locator('[data-testid="employment-breadcrumb"]').boundingBox();
    const firstRow = await page.locator('[data-testid="employment-row"]').first().boundingBox();
    const lastRow = await page.locator('[data-testid="employment-row"]').last().boundingBox();
    const box = await page.locator('[data-testid="employment-row"]').first().locator("xpath=../..").boundingBox();
    expect(breadcrumb && firstRow && lastRow && box).toBeTruthy();
    if (!breadcrumb || !firstRow || !lastRow || !box) return;

    const gapAboveFirstRow = firstRow.y - (breadcrumb.y + breadcrumb.height);
    expect(gapAboveFirstRow).toBeLessThan(40);

    const gapBelowLastRow = box.y + box.height - (lastRow.y + lastRow.height);
    expect(gapBelowLastRow).toBeGreaterThanOrEqual(80);
  });
});

// Behavioral e2e suite for Phase 10's Command Log removal + PanelBadge
// redesign (real, non-fixture build). Grown in step with the feature: this
// file starts with the Command Log coverage; the spacing suite lands in a
// later commit alongside its own fix.
import { expect, test, type Page } from "./fixtures.ts";

/** Asserts `actual` is within `tol` px of `target` — real-build layout
 * measurements are exact CSS px values (no zoom/scale involved), so a small
 * tolerance only absorbs sub-pixel layout rounding, never a real defect. */
function expectNear(actual: number, target: number, tol = 1.5) {
  expect(Math.abs(actual - target)).toBeLessThanOrEqual(tol);
}

async function box(page: Page, testid: string, nth = 0) {
  const b = await page.locator(`[data-testid="${testid}"]`).nth(nth).boundingBox();
  if (!b) throw new Error(`no bounding box for [data-testid="${testid}"] (nth=${nth})`);
  return b;
}

async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

test.describe("Repositories: Command Log panel removed", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("no panel [5] / Command Log exists on /repositories", async ({ page }) => {
    await gotoReady(page, "/repositories");
    await expect(page.locator('[data-testid="repositories-panel-5"]')).toHaveCount(0);
    await expect(page.getByText("Command Log")).toHaveCount(0);
    // Pressing "5" (the old panel-5 focus key) must be a no-op now — no
    // panel exists to focus, and it must not throw/break other panels.
    await page.keyboard.press("0");
    await expect(page.locator('[data-testid="repositories-panel-0"]')).toHaveAttribute(
      "style",
      /border: 1px solid rgb\(224, 69, 60\)/,
    );
    await page.keyboard.press("5");
    // Panel 0 must STAY focused — "5" no longer moves focus anywhere.
    await expect(page.locator('[data-testid="repositories-panel-0"]')).toHaveAttribute(
      "style",
      /border: 1px solid rgb\(224, 69, 60\)/,
    );
  });
});

test.describe("PanelBadge: [N] Label composition", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("Repositories panels [0]-[4] each read '[N] Label'", async ({ page }) => {
    await gotoReady(page, "/repositories");
    const expected: [number, string][] = [
      [0, "Status"],
      [1, "Repositories"],
      [2, "Files"],
      [3, "Content"],
      [4, "Commits"],
    ];
    for (const [n, label] of expected) {
      const badge = page.locator(`[data-testid="repositories-panel-${n}"] [data-testid="panel-badge"]`);
      await expect(badge).toHaveText(`[${n}] ${label}`);
    }
  });
});

test.describe("PanelBadge: no spider/spiderman glyph", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("Repositories, Employment Records, and Help badges carry no spider img", async ({ page }) => {
    await gotoReady(page, "/repositories");
    await expect(page.locator('[data-testid="panel-badge"] img[src*="spider" i]')).toHaveCount(0);

    await gotoReady(page, "/employment");
    await expect(page.locator('[data-testid="panel-badge"] img[src*="spider" i]')).toHaveCount(0);
    // Split-text badges compose as one spaced string now, glyph-free.
    const employmentBadges = page.locator('[data-testid="panel-badge"]');
    await expect(employmentBadges.nth(0)).toHaveText(/Employment\s+Records/);
    await expect(employmentBadges.nth(1)).toHaveText(/File\s+Preview/);

    await gotoReady(page, "/help");
    await expect(page.locator('[data-testid="panel-badge"] img[src*="spider" i]')).toHaveCount(0);
  });
});

test.describe("PanelBadge: left-aligned, not centered", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("Repositories badge pill sits near its wrapper's left edge", async ({ page }) => {
    await gotoReady(page, "/repositories");
    const wrapper = await box(page, "panel-badge", 0);
    const pillBox = await page.locator('[data-testid="panel-badge"]').nth(0).locator("span").first().boundingBox();
    expect(pillBox).toBeTruthy();
    if (!pillBox) return;
    const leftInset = pillBox.x - wrapper.x;
    const wouldBeCenteredInset = (wrapper.width - pillBox.width) / 2;
    // Left-aligned: inset is small (well under half the wrapper width) and
    // nowhere near where centering would place it.
    expect(leftInset).toBeGreaterThanOrEqual(0);
    expect(leftInset).toBeLessThan(wrapper.width / 4);
    expect(Math.abs(leftInset - wouldBeCenteredInset)).toBeGreaterThan(20);
  });

  test("Employment Records badge pill is also left-aligned", async ({ page }) => {
    await gotoReady(page, "/employment");
    const wrapper = await box(page, "panel-badge", 0);
    const pillBox = await page.locator('[data-testid="panel-badge"]').nth(0).locator("span").first().boundingBox();
    expect(pillBox).toBeTruthy();
    if (!pillBox) return;
    const leftInset = pillBox.x - wrapper.x;
    expect(leftInset).toBeGreaterThanOrEqual(0);
    expect(leftInset).toBeLessThan(wrapper.width / 4);
  });

  test("Help's inline section-header badge still sits at the start of its row (unaffected by the left-align change)", async ({
    page,
  }) => {
    await gotoReady(page, "/help");
    const badge = page.locator('[data-testid="panel-badge"][data-accent="teal"]').first();
    const badgeBox = await badge.boundingBox();
    // The inline wrapper's row: badge is the first flex child, followed by
    // a dotted rule — its own box should be no wider than its pill content
    // (inline mode never had a centering wrapper to begin with).
    const pillBox = await badge.locator("span").first().boundingBox();
    expect(badgeBox).toBeTruthy();
    expect(pillBox).toBeTruthy();
    if (badgeBox && pillBox) {
      expect(Math.abs(badgeBox.width - pillBox.width)).toBeLessThan(2);
    }
  });
});

// Regression coverage for the uniform-spacing pass: every inter-panel gap
// on /repositories (the column gap under the [0] Status bar, the gap
// between [1]/[2] in the left column, the gap between [3]/[4] in the right
// column, and the horizontal gap between the two columns) and the outer
// padding around the whole panel grid were all raised from 12px to 20px in
// one uniform sweep (Repositories.svelte's `repositories-panels-root` and
// its two column divs). This test measures real `getBoundingClientRect()`
// deltas between adjacent panels — never CSS text — so it catches a
// regression even if a future refactor moves the values into a different
// stylesheet layer.
test.describe("Repositories: panel spacing is a uniform 20px (gaps + outer padding)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("every inter-panel gap and the outer padding measure the same 20px", async ({ page }) => {
    await gotoReady(page, "/repositories");

    const root = await box(page, "repositories-panels-root");
    const panel0 = await box(page, "repositories-panel-0"); // Status
    const panel1 = await box(page, "repositories-panel-1"); // Repositories
    const panel2 = await box(page, "repositories-panel-2"); // Files
    const panel3 = await box(page, "repositories-panel-3"); // Content (preview)
    const panel4 = await box(page, "repositories-panel-4"); // Commits

    const gaps = {
      statusToReposRow: panel1.y - (panel0.y + panel0.height),
      statusToContentRow: panel3.y - (panel0.y + panel0.height),
      reposToFiles: panel2.y - (panel1.y + panel1.height),
      contentToCommits: panel4.y - (panel3.y + panel3.height),
      leftColumnToRightColumn: panel3.x - (panel1.x + panel1.width),
    };
    const paddings = {
      top: panel0.y - root.y,
      left: panel0.x - root.x,
      leftViaReposColumn: panel1.x - root.x,
      right: root.x + root.width - (panel3.x + panel3.width),
      rightViaCommits: root.x + root.width - (panel4.x + panel4.width),
      bottom: root.y + root.height - (panel2.y + panel2.height),
      bottomViaCommits: root.y + root.height - (panel4.y + panel4.height),
    };

    for (const [name, value] of Object.entries(gaps)) {
      expectNear(value, 20, 1.5);
      void name; // kept for a legible per-assertion label in a failed diff
    }
    for (const [name, value] of Object.entries(paddings)) {
      expectNear(value, 20, 1.5);
      void name;
    }

    // Every measured value — not just each one's closeness to 20 — must be
    // mutually consistent: gaps and the outer padding are ALL the same 20px,
    // not merely each individually close to it from different directions.
    const all = [...Object.values(gaps), ...Object.values(paddings)];
    expect(Math.max(...all) - Math.min(...all)).toBeLessThanOrEqual(2);
  });
});

import { expect, test, type Page } from "../support/fixtures";

async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

async function ctrlB(page: Page) {
  await page.keyboard.down("Control");
  await page.keyboard.press("b");
  await page.keyboard.up("Control");
}

async function prefixed(page: Page, key: string) {
  await ctrlB(page);
  await page.keyboard.press(key);
}

const panes = (page: Page) => page.locator('[data-testid="pane-leaf"]');
const focusedPane = (page: Page) =>
  page.locator('[data-testid="pane-leaf"][data-pane-focused="true"]');
const statusConfirm = (page: Page) => page.locator('[data-testid="status-confirm"]');

test.describe('splits (Ctrl-b | / % / - / ")', () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("| splits right, 50/50, and focuses the new pane", async ({ page }) => {
    await gotoReady(page, "/");
    await expect(panes(page)).toHaveCount(1);
    const before = (await panes(page).first().boundingBox())!;

    await prefixed(page, "|");
    await expect(panes(page)).toHaveCount(2);

    const left = (await panes(page).nth(0).boundingBox())!;
    const right = (await panes(page).nth(1).boundingBox())!;
    // Side by side: left's right edge meets right's left edge; roughly
    // equal widths; both span the same vertical extent as the original.
    expect(Math.abs(left.x + left.width - right.x)).toBeLessThan(3);
    expect(Math.abs(left.width - right.width)).toBeLessThan(3);
    expect(Math.abs(left.height - before.height)).toBeLessThan(3);
    expect(Math.abs(right.height - before.height)).toBeLessThan(3);

    // The RIGHT (new) pane is the one focused.
    await expect(focusedPane(page)).toHaveCount(1);
    const focusedBox = (await focusedPane(page).boundingBox())!;
    expect(Math.abs(focusedBox.x - right.x)).toBeLessThan(3);
  });

  test("- splits below, 50/50", async ({ page }) => {
    await gotoReady(page, "/");
    await prefixed(page, "-");
    await expect(panes(page)).toHaveCount(2);
    const top = (await panes(page).nth(0).boundingBox())!;
    const bottom = (await panes(page).nth(1).boundingBox())!;
    expect(Math.abs(top.y + top.height - bottom.y)).toBeLessThan(3);
    expect(Math.abs(top.width - bottom.width)).toBeLessThan(3);
  });

  test("| then - produces 3 panes: one full-height pane on the left, two stacked on the right", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await prefixed(page, "|");
    await prefixed(page, "-");
    await expect(panes(page)).toHaveCount(3);

    const [left, topRight, bottomRight] = await Promise.all([
      panes(page).nth(0).boundingBox(),
      panes(page).nth(1).boundingBox(),
      panes(page).nth(2).boundingBox(),
    ]);
    if (!left || !topRight || !bottomRight) throw new Error("panes not laid out");

    // Left pane spans the full height; the right column is split top/bottom.
    expect(Math.abs(left.x + left.width - topRight.x)).toBeLessThan(3);
    expect(Math.abs(topRight.x - bottomRight.x)).toBeLessThan(3);
    expect(Math.abs(topRight.width - bottomRight.width)).toBeLessThan(3);
    expect(Math.abs(topRight.y + topRight.height - bottomRight.y)).toBeLessThan(3);
    expect(left.height).toBeGreaterThan(topRight.height + bottomRight.height - 6);
  });

  test('% and " are stock aliases for | and -', async ({ page }) => {
    await gotoReady(page, "/");
    await prefixed(page, "%");
    await expect(panes(page)).toHaveCount(2);
    const left = (await panes(page).nth(0).boundingBox())!;
    const right = (await panes(page).nth(1).boundingBox())!;
    expect(Math.abs(left.x + left.width - right.x)).toBeLessThan(3);

    await prefixed(page, '"');
    await expect(panes(page)).toHaveCount(3);
  });

  test("a new split pane is a shell prompt", async ({ page }) => {
    await gotoReady(page, "/");
    await prefixed(page, "|");
    await expect(focusedPane(page).locator('[data-shell-mode="pane"]')).toBeVisible();
  });
});

test.describe("pane navigation: prefix o / arrows / ;", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("o cycles focus through every pane, wrapping", async ({ page }) => {
    await gotoReady(page, "/");
    await prefixed(page, "|");
    await prefixed(page, "-"); // 3 panes, rightmost-bottom focused
    const start = (await focusedPane(page).boundingBox())!;

    await prefixed(page, "o");
    const step1 = (await focusedPane(page).boundingBox())!;
    expect(step1).not.toEqual(start);

    await prefixed(page, "o");
    const step2 = (await focusedPane(page).boundingBox())!;
    expect(step2).not.toEqual(step1);
    expect(step2).not.toEqual(start);

    // Three panes total — a THIRD "o" press (the full cycle) wraps back to
    // the pane focused at the very start.
    await prefixed(page, "o");
    const wrapped = (await focusedPane(page).boundingBox())!;
    expect(Math.abs(wrapped.x - start.x)).toBeLessThan(3);
    expect(Math.abs(wrapped.y - start.y)).toBeLessThan(3);
  });

  test("arrow keys move focus geometrically", async ({ page }) => {
    await gotoReady(page, "/");
    await prefixed(page, "|"); // left | right(focused)
    const leftBox = (await panes(page).nth(0).boundingBox())!;

    await prefixed(page, "ArrowLeft");
    const focusedBox = (await focusedPane(page).boundingBox())!;
    expect(Math.abs(focusedBox.x - leftBox.x)).toBeLessThan(3);

    // Pressing left again (already leftmost) is a silent no-op.
    await prefixed(page, "ArrowLeft");
    const stillLeft = (await focusedPane(page).boundingBox())!;
    expect(Math.abs(stillLeft.x - leftBox.x)).toBeLessThan(3);
  });

  test("; jumps back to the last-focused pane, toggling back and forth", async ({ page }) => {
    await gotoReady(page, "/");
    await prefixed(page, "|"); // right pane focused
    const rightBox = (await focusedPane(page).boundingBox())!;
    const leftBox = (await panes(page).nth(0).boundingBox())!;

    await prefixed(page, ";");
    const afterFirst = (await focusedPane(page).boundingBox())!;
    expect(Math.abs(afterFirst.x - leftBox.x)).toBeLessThan(3);

    await prefixed(page, ";");
    const afterSecond = (await focusedPane(page).boundingBox())!;
    expect(Math.abs(afterSecond.x - rightBox.x)).toBeLessThan(3);
  });
});

test.describe("Ctrl-b x real kill-pane", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  test("prompts the exact kill-pane {pane_index}? (y/n) text; n cancels; y kills only the focused pane", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await prefixed(page, "|"); // 2 panes, right (index 1) focused
    await expect(panes(page)).toHaveCount(2);

    await prefixed(page, "x");
    await expect(statusConfirm(page)).toHaveText("kill-pane 1? (y/n)");
    await page.keyboard.press("n");
    await expect(statusConfirm(page)).not.toBeVisible();
    await expect(panes(page)).toHaveCount(2);

    await prefixed(page, "x");
    await page.keyboard.press("y");
    await expect(statusConfirm(page)).not.toBeVisible();
    await expect(panes(page)).toHaveCount(1);
  });

  test("ANY key other than lowercase y cancels the confirm (uppercase Y does NOT confirm here)", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await prefixed(page, "|");
    await prefixed(page, "x");
    await page.keyboard.press("z");
    await expect(statusConfirm(page)).not.toBeVisible();
    await expect(panes(page)).toHaveCount(2);

    await prefixed(page, "x");
    await page.keyboard.press("Y");
    await expect(statusConfirm(page)).not.toBeVisible();
    await expect(panes(page)).toHaveCount(2);
  });

  test("killing the last pane in a window cascades to kill-window", async ({ page }) => {
    await gotoReady(page, "/repositories");
    await prefixed(page, "x");
    await expect(statusConfirm(page)).toHaveText("kill-pane 0? (y/n)");
    await page.keyboard.press("y");
    await expect(
      page.locator('[data-testid="status-bar-window"][data-window-id="repositories"]'),
    ).toHaveCount(0);
    await expect(page).toHaveURL(/\/employment$/);
  });

  test("killing the last pane of the last window cascades all the way to [exited]", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    for (let i = 0; i < 5; i++) {
      await prefixed(page, "&");
      await page.keyboard.press("y");
    }
    await expect(page.locator('[data-testid="status-bar-window"]')).toHaveCount(1);
    await prefixed(page, "x");
    await page.keyboard.press("y");
    await expect(page.locator('[data-testid="status-bar-windows"]')).not.toBeVisible();
    await expect(page.locator('[data-shell-mode="host"]')).toBeVisible();
    await expect(page.locator('[data-testid="shell-line"]').last()).toHaveText("[exited]");
  });

  test("kill-pane tmux command (Ctrl-b :) kills the focused pane with NO confirm", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await prefixed(page, "|");
    await expect(panes(page)).toHaveCount(2);
    await prefixed(page, ":");
    await page.keyboard.type("kill-pane");
    await page.keyboard.press("Enter");
    await expect(statusConfirm(page)).not.toBeVisible();
    await expect(panes(page)).toHaveCount(1);
  });
});

test.describe("layouts: Ctrl-b Space cycles the 7 presets", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  async function makeThreePanes(page: Page) {
    await gotoReady(page, "/");
    await prefixed(page, "|");
    await prefixed(page, "-");
    await expect(panes(page)).toHaveCount(3);
  }

  test("Space cycles even-horizontal -> even-vertical -> main-horizontal -> main-horizontal-mirrored -> main-vertical -> main-vertical-mirrored -> tiled -> wraps", async ({
    page,
  }) => {
    await makeThreePanes(page);

    // even-horizontal: 3 columns, all roughly the same width, full height.
    await prefixed(page, " ");
    let boxes = await Promise.all([
      panes(page).nth(0).boundingBox(),
      panes(page).nth(1).boundingBox(),
      panes(page).nth(2).boundingBox(),
    ]);
    if (boxes.some((b) => !b)) throw new Error("not laid out");
    let [a, b, c] = boxes as { x: number; y: number; width: number; height: number }[];
    expect(Math.abs(a.y - b.y)).toBeLessThan(3);
    expect(Math.abs(b.y - c.y)).toBeLessThan(3);
    expect(Math.abs(a.x + a.width - b.x)).toBeLessThan(3);
    expect(Math.abs(b.x + b.width - c.x)).toBeLessThan(3);

    // even-vertical: 3 rows, all roughly the same height, full width.
    await prefixed(page, " ");
    boxes = await Promise.all([
      panes(page).nth(0).boundingBox(),
      panes(page).nth(1).boundingBox(),
      panes(page).nth(2).boundingBox(),
    ]);
    [a, b, c] = boxes as { x: number; y: number; width: number; height: number }[];
    expect(Math.abs(a.x - b.x)).toBeLessThan(3);
    expect(Math.abs(b.x - c.x)).toBeLessThan(3);
    expect(Math.abs(a.y + a.height - b.y)).toBeLessThan(3);
    expect(Math.abs(b.y + b.height - c.y)).toBeLessThan(3);

    // main-horizontal: one big pane on TOP, full width, taller than the two
    // columns sharing the bottom row.
    await prefixed(page, " ");
    const mainTop = (await panes(page).nth(0).boundingBox())!;
    const bottomLeft = (await panes(page).nth(1).boundingBox())!;
    const bottomRight = (await panes(page).nth(2).boundingBox())!;
    expect(mainTop.y).toBeLessThan(bottomLeft.y);
    expect(mainTop.height).toBeGreaterThan(bottomLeft.height);
    expect(Math.abs(bottomLeft.y - bottomRight.y)).toBeLessThan(3);

    // main-horizontal-mirrored: the big pane is now on the BOTTOM.
    await prefixed(page, " ");
    const topLeft2 = (await panes(page).nth(0).boundingBox())!;
    const mainBottom = (await panes(page).nth(2).boundingBox())!;
    expect(mainBottom.y).toBeGreaterThan(topLeft2.y);
    expect(mainBottom.height).toBeGreaterThan(topLeft2.height);

    // main-vertical: big pane on the LEFT, full height.
    await prefixed(page, " ");
    const mainLeft = (await panes(page).nth(0).boundingBox())!;
    const rightTop = (await panes(page).nth(1).boundingBox())!;
    const rightBottom = (await panes(page).nth(2).boundingBox())!;
    expect(mainLeft.x).toBeLessThan(rightTop.x);
    expect(mainLeft.width).toBeGreaterThan(rightTop.width);
    expect(Math.abs(rightTop.x - rightBottom.x)).toBeLessThan(3);

    // main-vertical-mirrored: big pane on the RIGHT.
    await prefixed(page, " ");
    const leftTop3 = (await panes(page).nth(0).boundingBox())!;
    const mainRight = (await panes(page).nth(2).boundingBox())!;
    expect(mainRight.x).toBeGreaterThan(leftTop3.x);
    expect(mainRight.width).toBeGreaterThan(leftTop3.width);

    // tiled: near-even grid — for 3 panes, a row of 2 then a short row of 1
    // spanning the full width underneath.
    await prefixed(page, " ");
    const gridTopLeft = (await panes(page).nth(0).boundingBox())!;
    const gridTopRight = (await panes(page).nth(1).boundingBox())!;
    const gridBottom = (await panes(page).nth(2).boundingBox())!;
    expect(Math.abs(gridTopLeft.y - gridTopRight.y)).toBeLessThan(3);
    expect(gridBottom.y).toBeGreaterThan(gridTopLeft.y);
    expect(gridBottom.width).toBeGreaterThan(gridTopLeft.width + 6);

    // Wraps back to even-horizontal (3 equal columns again).
    await prefixed(page, " ");
    boxes = await Promise.all([
      panes(page).nth(0).boundingBox(),
      panes(page).nth(1).boundingBox(),
      panes(page).nth(2).boundingBox(),
    ]);
    [a, b, c] = boxes as { x: number; y: number; width: number; height: number }[];
    expect(Math.abs(a.y - b.y)).toBeLessThan(3);
    expect(Math.abs(a.x + a.width - b.x)).toBeLessThan(3);
  });

  test("select-layout <name> applies a named preset from the Ctrl-b : command prompt", async ({
    page,
  }) => {
    await makeThreePanes(page);
    await prefixed(page, ":");
    await page.keyboard.type("select-layout main-vertical");
    await page.keyboard.press("Enter");
    const mainLeft = (await panes(page).nth(0).boundingBox())!;
    const rightTop = (await panes(page).nth(1).boundingBox())!;
    expect(mainLeft.width).toBeGreaterThan(rightTop.width);
  });

  test("bare select-layout reapplies the last-applied preset", async ({ page }) => {
    await makeThreePanes(page);
    await prefixed(page, ":");
    await page.keyboard.type("select-layout even-vertical");
    await page.keyboard.press("Enter");
    // A manual split diverges the tree from the applied preset...
    await prefixed(page, "|");
    await expect(panes(page)).toHaveCount(4);
    // ...bare select-layout snaps all 4 panes back to even-vertical rows.
    await prefixed(page, ":");
    await page.keyboard.type("select-layout");
    await page.keyboard.press("Enter");
    const boxes = await Promise.all([0, 1, 2, 3].map((i) => panes(page).nth(i).boundingBox()));
    if (boxes.some((b) => !b)) throw new Error("not laid out");
    const [r0, r1, r2, r3] = boxes as { x: number; width: number }[];
    expect(Math.abs(r0.x - r1.x)).toBeLessThan(3);
    expect(Math.abs(r1.x - r2.x)).toBeLessThan(3);
    expect(Math.abs(r2.x - r3.x)).toBeLessThan(3);
  });

  test("select-layout with an unknown name reports an error; usage-less bare form no-ops when nothing was ever applied", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await prefixed(page, ":");
    await page.keyboard.type("select-layout bogus-layout");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="cmdline-error"]')).toHaveText(
      "unknown layout: bogus-layout",
    );
    await page.keyboard.press("Escape");

    // Bare `select-layout` on a window that never had a layout applied is a true no-op (tmux.ts's reapplyLastLayout returns early) — the box closes cleanly via Cmdline.svelte's close-on-undefined contract, and the window stays exactly as it was.
    await prefixed(page, ":");
    await page.keyboard.type("select-layout");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="cmdline-overlay"]')).not.toBeVisible();
    await expect(panes(page)).toHaveCount(1);
  });
});

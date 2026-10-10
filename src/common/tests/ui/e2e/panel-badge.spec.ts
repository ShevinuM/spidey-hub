import { expect, test, type Page } from "../support/fixtures";

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

  test("no pane 5 / Command Log exists on /repositories", async ({ page }) => {
    await gotoReady(page, "/repositories");
    await expect(page.locator('[data-testid="repositories-panel-5"]')).toHaveCount(0);
    await expect(page.getByText("Command Log")).toHaveCount(0);
    // Pressing "5" must be a no-op — no pane exists to focus, and it must not throw/break other panes.
    await page.keyboard.press("0");
    const statusBadge = page.getByTestId("repositories-panel-0").getByTestId("panel-badge");
    await expect(statusBadge).toHaveAttribute("data-focused", "");
    await page.keyboard.press("5");
    // Pane 0 stays focused — "5" doesn't move focus.
    await expect(statusBadge).toHaveAttribute("data-focused", "");
  });
});

const REPOSITORIES_BADGES: [number, string][] = [
  [0, "STATUS"],
  [1, "REPOSITORIES"],
  [2, "FILES"],
  [3, "CONTENT"],
  [4, "COMMITS"],
];

const EMPLOYMENT_BADGES: [number, string][] = [
  [1, "EMPLOYMENT RECORDS"],
  [2, "FILE PREVIEW"],
];

/** Every badge on both pages, paired with the testid of an element whose
 * horizontal centre equals its pane's centre.
 *
 * `badgeInsidePane` marks panes that contain their own badge, so its frame
 * can be found under the pane instead of by DOM order. */
const BADGE_PAGES: {
  path: string;
  count: number;
  paneTestids: string[];
  badgeInsidePane: boolean;
}[] = [
  {
    path: "/repositories",
    count: 5,
    paneTestids: REPOSITORIES_BADGES.map(([n]) => `repositories-panel-${n}`),
    badgeInsidePane: true,
  },
  {
    path: "/employment",
    count: 2,
    paneTestids: ["employment-records-list", "employment-preview"],
    badgeInsidePane: false,
  },
];

test.describe("PanelBadge: pixel-frame index badge", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  for (const { path, count } of BADGE_PAGES) {
    test(`${path} renders exactly ${count} badges`, async ({ page }) => {
      await gotoReady(page, path);
      await expect(page.getByTestId("panel-badge")).toHaveCount(count);
    });
  }

  test("Repositories panes 0-4 show their index and uppercase label", async ({ page }) => {
    await gotoReady(page, "/repositories");
    for (const [n, label] of REPOSITORIES_BADGES) {
      const pane = page.getByTestId(`repositories-panel-${n}`);
      await expect(pane.getByTestId("panel-badge-index")).toHaveText(String(n));
      await expect(pane.getByTestId("panel-badge-label")).toHaveText(label);
    }
  });

  test("Employment Records and Preview show their index and uppercase label", async ({ page }) => {
    await gotoReady(page, "/employment");
    for (const [i, [n, label]] of EMPLOYMENT_BADGES.entries()) {
      const badge = page.getByTestId("panel-badge").nth(i);
      await expect(badge.getByTestId("panel-badge-index")).toHaveText(String(n));
      await expect(badge.getByTestId("panel-badge-label")).toHaveText(label);
    }
  });

  for (const { path, count, paneTestids, badgeInsidePane } of BADGE_PAGES) {
    test(`${path} badges carry no image`, async ({ page }) => {
      await gotoReady(page, path);
      const badges = page.getByTestId("panel-badge");
      await expect(badges).toHaveCount(count);
      for (let i = 0; i < count; i++) {
        expect(await badges.nth(i).evaluate((el) => el.querySelectorAll("img").length)).toBe(0);
      }
    });

    test(`${path} badge frames are centred on their panes`, async ({ page }) => {
      await gotoReady(page, path);
      const frames = page.getByTestId("panel-badge-frame");
      await expect(frames).toHaveCount(count);
      for (let i = 0; i < count; i++) {
        const paneEl = page.getByTestId(paneTestids[i]);
        const frameEl = badgeInsidePane ? paneEl.getByTestId("panel-badge-frame") : frames.nth(i);
        const frame = await frameEl.boundingBox();
        const pane = await paneEl.boundingBox();
        expect(frame).toBeTruthy();
        expect(pane).toBeTruthy();
        if (frame && pane) {
          expectNear(frame.x + frame.width / 2, pane.x + pane.width / 2, 2);
        }
      }
    });

    test(`${path} badge frames are square, shadowed and pinned to a normal line-height`, async ({
      page,
    }) => {
      await gotoReady(page, path);
      const frames = page.getByTestId("panel-badge-frame");
      await expect(frames).toHaveCount(count);
      for (let i = 0; i < count; i++) {
        const frame = frames.nth(i);
        await expect(frame).toHaveCSS("border-radius", "0px");
        await expect(frame).toHaveCSS("line-height", "normal");
        const shadow = await frame.evaluate((el) => getComputedStyle(el).boxShadow);
        expect(shadow).toContain("rgba(74, 159, 224, 0.4) 0px 0px 0px 1px inset");
        expect(shadow).toContain("rgb(10, 14, 19) 0px 0px 0px 3px");
      }
    });

    test(`${path} unfocused badge indexes are a red block with dark text`, async ({ page }) => {
      await gotoReady(page, path);
      const badges = page.getByTestId("panel-badge");
      await expect(badges).toHaveCount(count);
      for (let i = 0; i < count; i++) {
        const badge = badges.nth(i);
        if ((await badge.getAttribute("data-focused")) !== null) continue;
        const index = badge.getByTestId("panel-badge-index");
        await expect(index).toHaveCSS("background-color", "rgb(224, 69, 60)");
        await expect(index).toHaveCSS("color", "rgb(10, 14, 19)");
      }
    });

    test(`${path} badge labels use the 10.5px tracked blue type`, async ({ page }) => {
      await gotoReady(page, path);
      const labels = page.getByTestId("panel-badge-label");
      await expect(labels).toHaveCount(count);
      for (let i = 0; i < count; i++) {
        const label = labels.nth(i);
        await expect(label).toHaveCSS("font-size", "10.5px");
        await expect(label).toHaveCSS("letter-spacing", "2.73px");
        await expect(label).toHaveCSS("color", "rgb(143, 208, 245)");
      }
    });
  }
});

test.describe("PanelBadge: focus cue", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/api.github.com/**", (route) => route.abort());
  });

  /** Asserts pane `n` holds the page's only focused badge, drawn with the bright index, and every other index stays the resting red. */
  async function expectFocusedPane(page: Page, n: number) {
    const focusedBadge = page.getByTestId(`repositories-panel-${n}`).getByTestId("panel-badge");
    await expect(focusedBadge).toHaveAttribute("data-focused", "");
    const focusedBadges = page.getByTestId("panel-badge").and(page.locator("[data-focused]"));
    await expect(focusedBadges).toHaveCount(1);
    await expect(focusedBadge.getByTestId("panel-badge-index")).toHaveCSS(
      "background-color",
      "rgb(255, 107, 111)",
    );
    for (const [other] of REPOSITORIES_BADGES) {
      if (other === n) continue;
      await expect(
        page.getByTestId(`repositories-panel-${other}`).getByTestId("panel-badge-index"),
      ).toHaveCSS("background-color", "rgb(224, 69, 60)");
    }
  }

  test("pane 2 holds the only focused badge on load", async ({ page }) => {
    await gotoReady(page, "/repositories");
    await expectFocusedPane(page, 2);
  });

  test("number keys move the focused badge to their pane", async ({ page }) => {
    await gotoReady(page, "/repositories");
    for (const n of [0, 1, 3, 4]) {
      await page.keyboard.press(String(n));
      await expectFocusedPane(page, n);
    }
  });
});

// Measures real `getBoundingClientRect()` deltas between adjacent panels, never CSS text, so this catches a regression even if a future refactor moves the values into a different stylesheet layer.
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

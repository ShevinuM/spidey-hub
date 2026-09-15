// Harness spec: proves GrepOverlay.svelte works standalone, mounted
// without Terminal's kernel, against the fixture grep index rather than
// the real site-source index the e2e suite uses.

// Every expected value here is derived from the real fixture plus the
// real search()/formatCount() port, never hardcoded, so a fixture edit
// can't silently desync this suite from the truth it's checking.
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GrepPage } from "../pages/GrepPage";
import { search, formatCount, type RepoFile } from "../../../lib/grep";

const FIXTURE_PATH = join(import.meta.dirname, "../support/grep-index.json");
const FIXTURE: RepoFile[] = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));

test.describe("Grep harness: mounts standalone with seeded fixture props", () => {
  test("/ opens the overlay; nothing renders before it's pressed", async ({ page }) => {
    const grep = new GrepPage(page);
    await grep.openHarness();

    await expect(grep.overlay).toHaveCount(0);
    await page.keyboard.press("/");
    await expect(grep.overlay).toBeVisible();
  });

  test("empty query lists the fixture index — counter reads file-count/file-count, at least 4 rows render", async ({
    page,
  }) => {
    const grep = new GrepPage(page);
    await grep.openHarness();
    await page.keyboard.press("/");

    const emptyHits = search(FIXTURE, "");
    await expect(grep.counter).toHaveText(formatCount(emptyHits, FIXTURE, ""));
    // The list pane measures its own rendered height and shows at least 4
    // rows (grepOverlayState.svelte.ts's own `Math.max(4, ...)` floor), so
    // the row count is a lower bound, not an equality — taller viewports
    // render more.
    await expect(grep.rows.nth(3)).toBeVisible();
  });

  test("typing a query filters the results and updates the counter", async ({ page }) => {
    const grep = new GrepPage(page);
    await grep.openHarness();
    await page.keyboard.press("/");
    await page.keyboard.type("grep");

    await expect(grep.query).toContainText("grep");
    const hits = search(FIXTURE, "grep");
    await expect(grep.counter).toHaveText(formatCount(hits, FIXTURE, "grep"));
    await expect(grep.rowByPath(hits[0].path).first()).toBeVisible();
  });

  test("arrow-key navigation moves the selection", async ({ page }) => {
    const grep = new GrepPage(page);
    await grep.openHarness();
    await page.keyboard.press("/");
    await page.keyboard.type("src/lib");

    const hits = search(FIXTURE, "src/lib");
    expect(hits.length).toBeGreaterThan(1);

    await expect(grep.rowByPath(hits[0].path).first()).toHaveAttribute("data-selected", "true");
    await page.keyboard.press("ArrowDown");
    await expect(grep.rowByPath(hits[1].path).first()).toHaveAttribute("data-selected", "true");
    await expect(grep.rowByPath(hits[0].path).first()).toHaveAttribute("data-selected", "false");
  });

  test("the preview pane renders the selected row's lines", async ({ page }) => {
    const grep = new GrepPage(page);
    await grep.openHarness();
    await page.keyboard.press("/");
    await page.keyboard.type("grep");

    const hits = search(FIXTURE, "grep");
    const first = hits[0];
    expect(first.line).toBeGreaterThan(0); // a real content hit, not a path-only row
    const file = FIXTURE.find((f) => f.path === first.path)!;
    const matchedLine = file.lines[first.line - 1];

    await expect(grep.file).toHaveText(first.path);
    await expect(grep.preview).toContainText(matchedLine);
  });

  test("Escape closes the overlay", async ({ page }) => {
    const grep = new GrepPage(page);
    await grep.openHarness();
    await page.keyboard.press("/");
    await expect(grep.overlay).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(grep.overlay).toHaveCount(0);
  });

  test("no Terminal kernel chrome mounts alongside it (no status bar, no window switching)", async ({
    page,
  }) => {
    const grep = new GrepPage(page);
    await grep.openHarness();

    await expect(grep.statusBar.windows).toHaveCount(0);
  });
});

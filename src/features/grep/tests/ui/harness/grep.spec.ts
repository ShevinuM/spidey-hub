// Harness spec — proves GrepOverlay.svelte itself works, mounted alone (no
// Terminal kernel, no tmux chrome, no window-level keydown routing beyond
// what GrepHarness.svelte itself reproduces) against `/harness/grep`
// (fixture build only, seeded fixture props via GrepHarness.svelte — see
// that wrapper's own header comment for the one piece of Terminal keydown
// routing it reproduces).
//
// Deliberately NOT a copy of
// src/features/grep/tests/ui/e2e/grep.spec.ts: that suite exercises this
// overlay through the real kernel against the real site-source index —
// this file mounts standalone against the FIXTURE grep index
// (src/features/grep/tests/ui/support/grep-index.json, served from
// `dist/generated/grep-index.json` by `build:fixtures`' own `cp` step) and
// covers exactly: mount + `/` opening the overlay, the empty-query row
// list, typing a query filtering the results and updating the counter,
// arrow-key navigation moving the selection (grep types `g`/`G` into the
// query like any other character rather than jumping — see the ported
// e2e suite's own "g and G are typed into the query like any other
// character (no jump)" test — so this suite exercises arrow-key
// navigation only, not a vim-style jump), the preview pane rendering the
// selected row's lines, and Escape closing — the feature's own core
// interactions, independent of the kernel.
//
// Every count and piece of expected text below is derived from the real
// fixture file plus the real `search`/`formatCount` port (same
// "derive the expectation from the real source" convention the ported e2e
// suite and repositories' own harness spec use), not hardcoded, so a
// future fixture edit doesn't silently desync this suite from the truth
// it's supposed to check. Assertions are web-first throughout, since a
// harness spec has no live clock to race the way a ported spec might
// (playwright.md R002) — no CSS-selector reads (including inside
// `page.evaluate()`), only page-object locators built from testids and
// visible text; the one non-retrying read anywhere in this file is
// `readFileSync`ing the fixture to derive an expected value, never used as
// an assertion itself.
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

  test("no Terminal kernel chrome mounts alongside it (no status bar, no window switching)", async ({ page }) => {
    const grep = new GrepPage(page);
    await grep.openHarness();

    await expect(grep.statusBar.windows).toHaveCount(0);
  });
});

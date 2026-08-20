// Behavioral e2e suite for the Employment Records (yazi clone) view, against
// the real-content build.
//
// Real content is a variable-depth, path-derived tree (no frontmatter
// `company`/`employmentType` grouping):
//   enaimco/
//     software-developer/
//       role.md                (overview — a FILE sitting alongside 3 dirs)
//       full-time/role.md
//       part-time/role.md
//       co-op/role.md
//   memorial-university/
//     software-developer/role.md
//     computer-science-tutor/role.md
//     research-assistant/role.md
//     design-and-development-assistant/role.md
//     communications-assistant/role.md
//
// `enaimco/software-developer/` is the key depth-generic case: its listing
// mixes a role FILE (role.md, listed first) with 3 role DIRECTORIES
// (full-time/, part-time/, co-op/) at the very same level.
//
// There is no `employment-path` breadcrumb, so this suite asserts "which
// directory are we in" via which rows are visible instead (a directory's
// own children are a distinctive fingerprint: e.g. only `enaimco/software-
// developer/` ever renders a `full-time/` row).
import type { Locator } from "@playwright/test";
import { expect, test, type Page } from "./fixtures.ts";
// This spec's `context` fixture (imported
// from ./fixtures.ts, not raw "@playwright/test") pre-seeds the boot-seen
// sessionStorage flag before every navigation, so BootSequence.svelte's
// ~4.6s unskippable sequence never runs for these tests — see that
// file's header comment for why this is a context-fixture override
// rather than a per-goto-helper change.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");

async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

/** Opens the Employment Records view from the dashboard (via the tmux prefix, the
 * only keyboard way to switch windows) and waits for its browser pane to be
 * visible. There's no more `employment-path` testid to wait on — the root's
 * own `enaimco/` row is an equally reliable "the view is up" signal. */
async function openEmployment(page: Page) {
  await gotoReady(page, "/");
  await page.keyboard.down("Control");
  await page.keyboard.press("b");
  await page.keyboard.up("Control");
  await page.keyboard.press("2");
  await expect(rowLocator(page, "enaimco/")).toBeVisible();
}

/** Reads a role .md file's body first line straight off disk (stripping
 * the frontmatter block), so the editor assertion below is checked against
 * ground truth, not a second copy of the same string. Employment role content
 * files start with a `---`-delimited frontmatter block (unlike the repo files
 * repositories.spec.ts reads), so a naive `split("\n")[0]` would return "---"
 * instead of the doc's own first line. */
function firstBodyLineOf(relPath: string): string {
  const content = readFileSync(join(ROOT, "src/content/personnel", relPath), "utf8");
  const lines = content.split("\n");
  let i = 1;
  while (lines[i] !== "---") i++;
  return lines[i + 1];
}

function rowLocator(page: Page, name: string) {
  return page.locator(`[data-testid="employment-row"][data-row-name="${name}"]`);
}

const posText = (page: Page) => page.locator('[data-testid="employment-pos"]');
const hintText = (page: Page) => page.locator('[data-testid="employment-hint"]');
const upRow = (page: Page) => page.locator('[data-testid="employment-up-row"]');
const promptRow = (page: Page) => page.locator('[data-testid="employment-prompt"]');
const filterRow = (page: Page) => page.locator('[data-testid="employment-filter-row"]');
const filterCursor = (page: Page) => page.locator('[data-testid="employment-filter-cursor"]');
const lsRows = (page: Page) => page.locator('[data-testid="employment-ls-row"]');

const SELECTED_STYLE = /rgba\(224, 69, 60, 0\.2\)/;

/** All rows currently rendered in the File Browser, `../` included, in DOM
 * (== display) order — used to assert row ORDER (item 23a puts `../` first
 * in subdirectories) without caring which of the two testids each is. */
function allRowNames(page: Page): Promise<(string | null)[]> {
  return page
    .locator('[data-testid="employment-row"], [data-testid="employment-up-row"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-row-name")));
}

/** "Strictly one line" — an element whose rendered height
 * is at most ~1.6 line-heights tall hasn't wrapped (mirrors the executor
 * brief's own suggested tolerance). */
async function isSingleLine(locator: Locator): Promise<boolean> {
  return locator.evaluate((el: HTMLElement) => {
    const cs = getComputedStyle(el);
    const lineHeight = Number.parseFloat(cs.lineHeight) || el.clientHeight || 1;
    return el.clientHeight <= lineHeight * 1.6;
  });
}

test.describe("Employment: no path breadcrumb (item 7)", () => {
  test("the employment-path breadcrumb testid is gone entirely", async ({ page }) => {
    await openEmployment(page);
    await expect(page.locator('[data-testid="employment-path"]')).toHaveCount(0);
  });
});

test.describe("Employment: icons (item 1)", () => {
  test("root rows render folder-icon SVGs, not the old triangle glyph", async ({ page }) => {
    await openEmployment(page);
    await expect(rowLocator(page, "enaimco/").locator('svg[data-icon="folder"]')).toBeVisible();
    await expect(rowLocator(page, "memorial-university/").locator('svg[data-icon="folder"]')).toBeVisible();
    await expect(rowLocator(page, "enaimco/").locator('svg[data-icon="folder"]')).toHaveCount(1);
    // No stray glyph text anywhere in the icon slot.
    await expect(rowLocator(page, "enaimco/")).not.toContainText("▸");
  });

  test("a mixed listing renders per-extension file icons for role.md and folder icons for directories; ../ gets its own icon", async ({
    page,
  }) => {
    await openEmployment(page);
    await page.keyboard.press("Enter"); // -> enaimco/
    await page.keyboard.press("Enter"); // -> enaimco/software-developer/
    // role.md's icon is resolved from material-file-icons (no data-icon
    // marker of its own — that attribute is only on the hand-drawn
    // folder/up glyphs) — a bare <svg> in the icon slot is enough to prove
    // it rendered something other than the folder/up icons.
    await expect(rowLocator(page, "role.md").locator("svg")).toBeVisible();
    await expect(rowLocator(page, "role.md").locator("svg[data-icon]")).toHaveCount(0);
    await expect(rowLocator(page, "full-time/").locator('svg[data-icon="folder"]')).toBeVisible();
    await expect(rowLocator(page, "part-time/").locator('svg[data-icon="folder"]')).toBeVisible();
    await expect(rowLocator(page, "co-op/").locator('svg[data-icon="folder"]')).toBeVisible();
    await expect(upRow(page).locator('svg[data-icon="up"]')).toBeVisible();
    await expect(rowLocator(page, "role.md")).not.toContainText("▤");
  });
});

test.describe("Employment: one-line rows (item 3)", () => {
  test("a list row's name cell never wraps, even conceptually long ones", async ({ page }) => {
    await openEmployment(page);
    const nameCell = rowLocator(page, "memorial-university/").locator("span").nth(1);
    await expect(nameCell).toHaveCSS("white-space", "nowrap");
    await expect(nameCell).toHaveCSS("text-overflow", "ellipsis");
    expect(await isSingleLine(nameCell)).toBe(true);
  });

  test("an ls -l preview row renders as a single pre-formatted line", async ({ page }) => {
    await openEmployment(page);
    const row = lsRows(page).first();
    await expect(row).toHaveCSS("white-space", "pre");
    await expect(row).toHaveCSS("text-overflow", "ellipsis");
    expect(await isSingleLine(row)).toBe(true);
  });

  test("a doc preview line stays one line even when the source markdown line is very long", async ({ page }) => {
    await openEmployment(page);
    await page.keyboard.press("Enter"); // -> enaimco/
    await page.keyboard.press("Enter"); // -> enaimco/software-developer/ (role.md selected by default)
    // role.md's own doc has a long bulleted line ("Cut deploy time from
    // 15+ minutes...") that would visibly wrap in the preview pane's
    // ~2fr-wide column without the nowrap/ellipsis styling item 3 adds.
    const longLine = page.locator('[data-testid="employment-doc-line"]', { hasText: "Cut deploy time" });
    await expect(longLine).toHaveCSS("white-space", "nowrap");
    await expect(longLine).toHaveCSS("text-overflow", "ellipsis");
    expect(await isSingleLine(longLine)).toBe(true);
  });
});

test.describe("Employment: root directory listing", () => {
  test("lists enaimco/ and memorial-university/; no ../ row at root (item 6); position/hint reflect selection", async ({
    page,
  }) => {
    await openEmployment(page);
    await expect(rowLocator(page, "enaimco/")).toBeVisible();
    await expect(rowLocator(page, "memorial-university/")).toBeVisible();
    await expect(upRow(page)).toHaveCount(0);

    await expect(posText(page)).toHaveText("1 / 2");
    await expect(rowLocator(page, "enaimco/")).toHaveAttribute("style", SELECTED_STYLE);
    // Item 24: the "j/k moves" clause is gone from the root hint.
    await expect(hintText(page)).toHaveText("enter opens enaimco/ · Ctrl-b ? for help");
  });

  test("enaimco/ and memorial-university/ show bare-digit meta counts (item 25)", async ({ page }) => {
    await openEmployment(page);
    await expect(rowLocator(page, "enaimco/")).toHaveText(/4$/);
    await expect(rowLocator(page, "enaimco/")).not.toContainText("role");
    await page.keyboard.press("ArrowDown");
    await expect(rowLocator(page, "memorial-university/")).toHaveText(/5$/);
    await expect(rowLocator(page, "memorial-university/")).not.toContainText("role");
  });

  test("selecting enaimco/ previews only its IMMEDIATE child, ls -l style (item 2)", async ({ page }) => {
    await openEmployment(page);
    await expect(lsRows(page)).toHaveCount(1);
    await expect(lsRows(page).first()).toHaveText("drwxr-xr-x  shev  May 2024  software-developer/");
    await expect(lsRows(page).first()).toHaveText(/^[.d][rwx-]{9}\s+shev\s+.+\s+\S+\/?$/);
  });

  test("selecting memorial-university/ previews all 5 of its immediate children, ls -l style", async ({ page }) => {
    await openEmployment(page);
    await page.keyboard.press("ArrowDown");
    await expect(lsRows(page)).toHaveCount(5);
    const texts = await lsRows(page).allTextContents();
    expect(texts).toEqual([
      "drwxr-xr-x  shev  Sep 2023  software-developer/",
      "drwxr-xr-x  shev  Jan 2024  computer-science-tutor/",
      "drwxr-xr-x  shev  Oct 2023  research-assistant/",
      "drwxr-xr-x  shev  Oct 2022  design-and-development-assistant/",
      "drwxr-xr-x  shev  Oct 2022  communications-assistant/",
    ]);
  });

  test("q does nothing from the root (bare q/Esc never navigate)", async ({ page }) => {
    await openEmployment(page);
    await page.keyboard.press("q");
    await expect(rowLocator(page, "enaimco/")).toBeVisible();
  });

  test("Esc also does nothing from the root", async ({ page }) => {
    await openEmployment(page);
    await page.keyboard.press("Escape");
    await expect(rowLocator(page, "enaimco/")).toBeVisible();
  });

  test("Enter, l, and ArrowRight all descend into enaimco/", async ({ page }) => {
    for (const key of ["Enter", "l", "ArrowRight"]) {
      await openEmployment(page);
      await page.keyboard.press(key);
      await expect(rowLocator(page, "software-developer/")).toBeVisible();
      // A visible ../ row is itself proof we've descended one level.
      await expect(upRow(page)).toBeVisible();
    }
  });

  test("single click on the enaimco/ row descends immediately (no select-then-activate)", async ({ page }) => {
    await openEmployment(page);
    await rowLocator(page, "enaimco/").click();
    await expect(rowLocator(page, "software-developer/")).toBeVisible();
    await expect(upRow(page)).toBeVisible();
  });
});

test.describe("Employment: enaimco/software-developer/ — mixed file + directory listing, ../ as a real row (item 23a)", () => {
  async function openEnaimcoSoftwareDeveloper(page: Page) {
    await openEmployment(page);
    await page.keyboard.press("Enter"); // -> enaimco/
    await page.keyboard.press("Enter"); // -> enaimco/software-developer/
    await expect(rowLocator(page, "role.md")).toBeVisible();
  }

  test("../ renders FIRST, then role.md, then the 3 employment-type directories", async ({ page }) => {
    await openEnaimcoSoftwareDeveloper(page);
    expect(await allRowNames(page)).toEqual(["../", "role.md", "full-time/", "part-time/", "co-op/"]);
    await expect(posText(page)).toHaveText("1 / 4");
    await expect(rowLocator(page, "full-time/")).toHaveText(/1$/);
  });

  test("role.md is selected first — hint and preview reflect a FILE selection", async ({ page }) => {
    await openEnaimcoSoftwareDeveloper(page);
    await expect(hintText(page)).toHaveText("enter opens role.md in nvim · h goes back · Ctrl-b ? for help");
    await expect(page.locator('[data-testid="employment-preview"]')).toContainText("Software Developer");
    await expect(lsRows(page)).toHaveCount(0);
  });

  test("ArrowUp from role.md (the first content row) selects ../ — reachable via keyboard (item 23a)", async ({ page }) => {
    await openEnaimcoSoftwareDeveloper(page);
    await page.keyboard.press("ArrowUp");
    await expect(upRow(page)).toHaveAttribute("style", SELECTED_STYLE);
    // ../ isn't "an entry" for position-counting purposes.
    await expect(posText(page)).toHaveText("0 / 4");
    await expect(hintText(page)).toHaveText("");
  });

  test("Enter on the selected ../ row ascends one level (item 23a)", async ({ page }) => {
    await openEnaimcoSoftwareDeveloper(page);
    await page.keyboard.press("ArrowUp"); // -> select ../
    await page.keyboard.press("Enter");
    await expect(rowLocator(page, "software-developer/")).toBeVisible();
    await expect(rowLocator(page, "role.md")).toHaveCount(0);
  });

  test("clicking ../ ascends one level too (mouse parity)", async ({ page }) => {
    await openEnaimcoSoftwareDeveloper(page);
    await upRow(page).click();
    await expect(rowLocator(page, "software-developer/")).toBeVisible();
  });

  test("ArrowDown from the last row (co-op/) wraps around to ../", async ({ page }) => {
    await openEnaimcoSoftwareDeveloper(page);
    // Walk from role.md (the first content row) down to co-op/ (the last).
    await page.keyboard.press("ArrowDown"); // -> full-time/
    await page.keyboard.press("ArrowDown"); // -> part-time/
    await page.keyboard.press("ArrowDown"); // -> co-op/ (last content row)
    await expect(posText(page)).toHaveText("4 / 4");
    await page.keyboard.press("ArrowDown");
    await expect(upRow(page)).toHaveAttribute("style", SELECTED_STYLE);
    await expect(posText(page)).toHaveText("0 / 4");
  });

  test("ArrowDown moves onto full-time/ — hint switches to a DIRECTORY selection and the preview becomes a 1-row ls -l listing", async ({
    page,
  }) => {
    await openEnaimcoSoftwareDeveloper(page);
    await page.keyboard.press("ArrowDown");
    await expect(posText(page)).toHaveText("2 / 4");
    await expect(rowLocator(page, "full-time/")).toHaveAttribute("style", SELECTED_STYLE);
    await expect(hintText(page)).toHaveText("enter opens full-time/ · h goes back · Ctrl-b ? for help");
    await expect(lsRows(page)).toHaveCount(1);
    await expect(lsRows(page).first()).toHaveText(".rw-r--r--  shev  Jul 2026  role.md");
  });

  test("Enter on role.md opens the editor directly from this mixed listing", async ({ page }) => {
    await openEnaimcoSoftwareDeveloper(page);
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
  });

  test("Enter on full-time/ descends into that directory (single-file listing, ../ present)", async ({ page }) => {
    await openEnaimcoSoftwareDeveloper(page);
    await page.keyboard.press("ArrowDown"); // -> full-time/
    await page.keyboard.press("Enter");
    await expect(rowLocator(page, "role.md")).toBeVisible();
    await expect(upRow(page)).toBeVisible();
    await expect(posText(page)).toHaveText("1 / 1");
  });

  test("h walks up to enaimco/ (not the root)", async ({ page }) => {
    await openEnaimcoSoftwareDeveloper(page);
    await page.keyboard.press("h");
    await expect(rowLocator(page, "software-developer/")).toBeVisible();
    await expect(rowLocator(page, "enaimco/")).toHaveCount(0);
  });

  test("descending always starts fresh at the first content row (role.md), even after a deeper visit", async ({ page }) => {
    await openEnaimcoSoftwareDeveloper(page);
    await page.keyboard.press("ArrowDown"); // -> full-time/
    await page.keyboard.press("h"); // -> enaimco/
    await page.keyboard.press("l"); // -> back into software-developer/, fresh selection
    await expect(posText(page)).toHaveText("1 / 4");
    await expect(rowLocator(page, "role.md")).toHaveAttribute("style", SELECTED_STYLE);
  });

  test("going up restores the ANCESTOR's own previous selection (memorial-university stays selected at root)", async ({
    page,
  }) => {
    await openEmployment(page);
    await page.keyboard.press("ArrowDown"); // root: select memorial-university/ (idx 1)
    await page.keyboard.press("Enter"); // descend into it
    await expect(rowLocator(page, "software-developer/")).toBeVisible();
    await page.keyboard.press("h"); // back up to root
    await expect(posText(page)).toHaveText("2 / 2");
    await expect(rowLocator(page, "memorial-university/")).toHaveAttribute("style", SELECTED_STYLE);
    await expect(upRow(page)).toHaveCount(0);
  });

  test("q and Esc do nothing at this level", async ({ page }) => {
    await openEnaimcoSoftwareDeveloper(page);
    await page.keyboard.press("q");
    await expect(rowLocator(page, "role.md")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(rowLocator(page, "role.md")).toBeVisible();
  });

});

test.describe("Employment: role file leaves + editor", () => {
  async function openFullTimeRole(page: Page) {
    await openEmployment(page);
    await page.keyboard.press("Enter"); // -> enaimco/
    await page.keyboard.press("Enter"); // -> enaimco/software-developer/
    await page.keyboard.press("ArrowDown"); // -> full-time/
    await page.keyboard.press("Enter"); // -> enaimco/software-developer/full-time/
    await expect(posText(page)).toHaveText("1 / 1");
  }

  test("lists the single role.md plus ../, doc pane shows the role", async ({ page }) => {
    await openFullTimeRole(page);
    await expect(rowLocator(page, "role.md")).toBeVisible();
    await expect(upRow(page)).toBeVisible();
    await expect(hintText(page)).toHaveText("enter opens role.md in nvim · h goes back · Ctrl-b ? for help");
    await expect(page.locator('[data-testid="employment-preview"]')).toContainText("Software Developer — Full-Time");
  });

  test("Enter opens the editor; first line matches the role .md body first line on disk", async ({ page }) => {
    await openFullTimeRole(page);
    await page.keyboard.press("Enter");
    const firstLine = page.locator('[data-line="1"] [data-testid="editor-line-text"]');
    await expect(firstLine).toHaveText(firstBodyLineOf("enaimco/software-developer/full-time/role.md"));
  });

  test("l and ArrowRight also open the editor (descend parity with Enter)", async ({ page }) => {
    for (const key of ["l", "ArrowRight"]) {
      await openFullTimeRole(page);
      await page.keyboard.press(key);
      await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
    }
  });

  test("single click on the role row opens the editor immediately", async ({ page }) => {
    await openFullTimeRole(page);
    await rowLocator(page, "role.md").click();
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
  });

  test("h and clicking ../ both walk up one level (not further)", async ({ page }) => {
    await openFullTimeRole(page);
    await page.keyboard.press("h");
    await expect(rowLocator(page, "full-time/")).toBeVisible();

    await openFullTimeRole(page);
    await upRow(page).click();
    await expect(rowLocator(page, "full-time/")).toBeVisible();
  });

  test("q from the role file level does nothing", async ({ page }) => {
    await openFullTimeRole(page);
    await page.keyboard.press("q");
    await expect(rowLocator(page, "role.md")).toBeVisible();
  });

  test("Esc from the role file level also does nothing", async ({ page }) => {
    await openFullTimeRole(page);
    await page.keyboard.press("Escape");
    await expect(rowLocator(page, "role.md")).toBeVisible();
  });
});

test.describe("Employment: memorial-university/ — 5 sibling directories, each one file deep", () => {
  async function openMemorial(page: Page) {
    await openEmployment(page);
    await page.keyboard.press("ArrowDown"); // -> memorial-university/
    await page.keyboard.press("Enter");
    await expect(posText(page)).toHaveText("1 / 5");
  }

  test("lists ../ then all 5 roles in order, each a single-file directory", async ({ page }) => {
    await openMemorial(page);
    expect(await allRowNames(page)).toEqual([
      "../",
      "software-developer/",
      "computer-science-tutor/",
      "research-assistant/",
      "design-and-development-assistant/",
      "communications-assistant/",
    ]);
  });

  test("selecting research-assistant/ (without descending) previews its single immediate child, ls -l style", async ({
    page,
  }) => {
    await openMemorial(page);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown"); // -> research-assistant/ (still a dir selection)
    await expect(lsRows(page)).toHaveCount(1);
    await expect(lsRows(page).first()).toHaveText(".rw-r--r--  shev  Oct 2023  role.md");
  });

  test("research-assistant/ displays the shortened title in its preview once descended", async ({ page }) => {
    await openMemorial(page);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown"); // -> research-assistant/
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="employment-preview"]')).toContainText("Research Assistant");
  });
});

test.describe("Employment: item 6 — no ../ anywhere at the root", () => {
  test("../ clicks walk all the way back up to the root, where there's nothing left to click", async ({ page }) => {
    await openEmployment(page);
    await rowLocator(page, "enaimco/").click();
    await rowLocator(page, "software-developer/").click();
    await rowLocator(page, "full-time/").click();
    await expect(rowLocator(page, "role.md")).toBeVisible();

    await upRow(page).click(); // full-time/ -> enaimco/software-developer/
    await expect(rowLocator(page, "full-time/")).toBeVisible();

    await upRow(page).click(); // -> enaimco/
    await expect(rowLocator(page, "software-developer/")).toBeVisible();

    await upRow(page).click(); // -> root
    await expect(rowLocator(page, "enaimco/")).toBeVisible();
    await expect(rowLocator(page, "memorial-university/")).toBeVisible();

    // Item 6: the root has no ../ row at all — the walk stops here.
    await expect(upRow(page)).toHaveCount(0);
  });

  test("click enaimco -> software-developer -> full-time -> role.md opens the editor, entirely by mouse", async ({
    page,
  }) => {
    await openEmployment(page);
    await rowLocator(page, "enaimco/").click();
    await rowLocator(page, "software-developer/").click();
    await rowLocator(page, "full-time/").click();
    await rowLocator(page, "role.md").click();
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
  });
});

test.describe("Employment: editor close paths", () => {
  async function openEditor(page: Page) {
    await openEmployment(page);
    await page.keyboard.press("Enter"); // -> enaimco/
    await page.keyboard.press("Enter"); // -> enaimco/software-developer/ (role.md selected)
    await page.keyboard.press("Enter"); // -> editor
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
  }

  test("q does nothing in the editor (:q is the only close path)", async ({ page }) => {
    await openEditor(page);
    await page.keyboard.press("q");
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
  });

  test("bare Esc in NORMAL mode does nothing — the editor stays open", async ({ page }) => {
    await openEditor(page);
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
  });

  test(":q closes the editor back to the enaimco/software-developer/ listing, not the dashboard", async ({ page }) => {
    await openEditor(page);
    await page.keyboard.press(":");
    await page.keyboard.type("q");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="editor-scroller"]')).not.toBeVisible();
    await expect(rowLocator(page, "full-time/")).toBeVisible();
  });

  test(":q! also closes the editor", async ({ page }) => {
    await openEditor(page);
    await page.keyboard.press(":");
    await page.keyboard.type("q!");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="editor-scroller"]')).not.toBeVisible();
  });

  test("clicking the [:q] pill closes the editor", async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-testid="editor-close-pill"]').click();
    await expect(page.locator('[data-testid="editor-scroller"]')).not.toBeVisible();
    await expect(rowLocator(page, "full-time/")).toBeVisible();
  });

  test(":w and :wq show a readonly error IN THE CMDLINE BOX and do not close the editor", async ({ page }) => {
    // The `:` ex-command line's presentation (typed text, resulting error)
    // lives in the site-wide floating Cmdline box
    // (src/components/Cmdline.svelte), not Editor.svelte's own footer —
    // see tests/e2e/cmdline.spec.ts for that box's own dedicated coverage.
    await openEditor(page);
    await page.keyboard.press(":");
    await page.keyboard.type("w");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
    await expect(page.locator('[data-testid="cmdline-error"]')).toContainText("readonly");
    await expect(page.locator('[data-testid="editor-message"]')).not.toBeVisible();

    await page.keyboard.press("Escape"); // dismiss the error and close the box
    await page.keyboard.press(":");
    await page.keyboard.type("wq");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
    await expect(page.locator('[data-testid="cmdline-error"]')).toContainText("readonly");
  });

  test("an unknown ex command shows an E492-style error IN THE CMDLINE BOX", async ({ page }) => {
    await openEditor(page);
    await page.keyboard.press(":");
    await page.keyboard.type("bogus");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="cmdline-error"]')).toContainText("E492");
  });

  test("i and x show a readonly bell and change nothing", async ({ page }) => {
    await openEditor(page);
    const firstLine = page.locator('[data-line="1"] [data-testid="editor-line-text"]');
    const before = await firstLine.textContent();

    await page.keyboard.press("i");
    await expect(page.locator('[data-testid="editor-message"]')).toContainText("E21");
    await expect(firstLine).toHaveText(before ?? "");

    await page.keyboard.press("x");
    await expect(page.locator('[data-testid="editor-message"]')).toContainText("E21");
    await expect(firstLine).toHaveText(before ?? "");
  });
});

test.describe("Employment: filter mode (item 23b)", () => {
  test("the filter cursor only blinks while filterMode is actually active (fixes the 'looks like it's already typing' visual bug)", async ({
    page,
  }) => {
    await openEmployment(page);
    // Not filtering yet: the cursor must NOT render, or a user could type
    // thinking the box is live and have every keystroke silently do
    // something else (this was the root cause behind the "search box
    // doesn't type" report — the cursor blinked unconditionally before).
    await expect(filterCursor(page)).toHaveCount(0);
    await page.keyboard.press("f");
    await expect(filterCursor(page)).toBeVisible();
    await page.keyboard.press("Enter"); // confirm — exits typing
    await expect(filterCursor(page)).toHaveCount(0);
  });

  test("REPRO + FIX: '/' typed WHILE already filtering appends to the query instead of opening the sitewide grep overlay", async ({
    page,
  }) => {
    // Root cause (traced via Terminal.svelte's dispatch order): while
    // filterMode was true but EmploymentRecords.isEditorOpen() still reported
    // `false`, Terminal's `paneIsGreedy` gate never turned on for
    // EmploymentRecords, so GrepOverlay's own "/" opener (consulted BEFORE
    // EmploymentRecords's own handleKey when not greedy) claimed the "/" keydown
    // first — every "/" typed into an active filter query silently opened
    // the sitewide grep overlay instead. Fixed by having `isEditorOpen()`
    // also report `true` while `filterMode` is active, which is exactly
    // what Terminal.svelte's own "does this pane own text input right
    // now" contract calls for.
    await openEmployment(page);
    await page.keyboard.press("Enter"); // -> enaimco/
    await page.keyboard.press("Enter"); // -> enaimco/software-developer/
    await page.keyboard.press("f");
    await page.keyboard.type("co");
    await page.keyboard.press("/");
    await expect(promptRow(page)).toContainText("co/");
    await expect(page.locator('[data-testid="grep-overlay"]')).toHaveCount(0);
  });

  test("INTENDED: '/' pressed BEFORE entering filter mode opens the sitewide grep overlay", async ({
    page,
  }) => {
    // Making "/" ITSELF an alternate filter-mode opener (alongside `f`)
    // would steal the sitewide grep binding on this view — a UX regression
    // for a nicety nobody asked for. `f` (and clicking the `>` prompt) is
    // the fixed, tested way to enter filter mode; outside of it, "/" keeps
    // its ordinary sitewide meaning like on every other view.
    await openEmployment(page);
    await page.keyboard.press("/");
    await expect(page.locator('[data-testid="grep-overlay"]')).toBeVisible();
  });

  test("f + 'co' filters enaimco/software-developer/'s listing to matching entries only", async ({ page }) => {
    await openEmployment(page);
    await page.keyboard.press("Enter"); // -> enaimco/
    await page.keyboard.press("Enter"); // -> enaimco/software-developer/ (4 entries)
    await expect(posText(page)).toHaveText("1 / 4");

    await page.keyboard.press("f");
    await page.keyboard.type("co");
    await expect(rowLocator(page, "co-op/")).toBeVisible();
    await expect(rowLocator(page, "role.md")).not.toBeVisible();
    await expect(rowLocator(page, "full-time/")).not.toBeVisible();
    await expect(rowLocator(page, "part-time/")).not.toBeVisible();
    // `../` is always kept regardless of the query.
    await expect(upRow(page)).toBeVisible();
    await expect(posText(page)).toHaveText("1 / 1");
    await expect(promptRow(page)).toContainText("co");
  });

  test("clicking the > prompt row enters filter mode (mouse path)", async ({ page }) => {
    await openEmployment(page);
    await page.keyboard.press("Enter"); // -> enaimco/
    await page.keyboard.press("Enter"); // -> enaimco/software-developer/
    await promptRow(page).click();
    await page.keyboard.type("co");
    await expect(rowLocator(page, "co-op/")).toBeVisible();
    await expect(rowLocator(page, "full-time/")).not.toBeVisible();
    await expect(promptRow(page)).toContainText("co");
  });

  test("the whole bordered filter row is clickable, not just the tiny > glyph (regression fix)", async ({
    page,
  }) => {
    // Root cause of the "clicking doesn't filter" report: the prompt span's
    // own hitbox measured ~8x17px (just the "> " glyph, idle query is
    // empty), with no border/box drawn around it, so a real click landing
    // anywhere else in that footer strip did nothing. Clicking near the
    // row's FAR edge (well away from the prompt text, close to the N / N
    // counter) now must still enter filter mode, proving the entire
    // bordered row — not just the glyph — is the hit target.
    await openEmployment(page);
    await page.keyboard.press("Enter"); // -> enaimco/
    await page.keyboard.press("Enter"); // -> enaimco/software-developer/
    const box = await filterRow(page).boundingBox();
    if (!box) throw new Error("filter row not found");
    await filterRow(page).click({ position: { x: box.width - 4, y: box.height / 2 } });
    await expect(filterCursor(page)).toBeVisible();
    await page.keyboard.type("co");
    await expect(rowLocator(page, "co-op/")).toBeVisible();
    await expect(rowLocator(page, "full-time/")).not.toBeVisible();
  });

  test("the filter row renders a visible border box in both idle and active states", async ({
    page,
  }) => {
    await openEmployment(page);
    await expect(filterRow(page)).toHaveCSS("border-style", "solid");
    await page.keyboard.press("f");
    await expect(filterRow(page)).toHaveCSS("border-style", "solid");
  });

  test("Esc restores the full list and exits filter mode", async ({ page }) => {
    await openEmployment(page);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.press("f");
    await page.keyboard.type("co");
    await expect(posText(page)).toHaveText("1 / 1");

    await page.keyboard.press("Escape");
    await expect(posText(page)).toHaveText("1 / 4");
    await expect(rowLocator(page, "role.md")).toBeVisible();
    await expect(rowLocator(page, "full-time/")).toBeVisible();
    await expect(rowLocator(page, "co-op/")).toBeVisible();
    // Esc, having exited filter mode rather than left the view, must not
    // also trigger any navigation.
    await expect(upRow(page)).toBeVisible();
  });

  test("typed 'j' while filtering types into the query (not a nav key here)", async ({ page }) => {
    await openEmployment(page);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.press("f");
    await expect(posText(page)).toHaveText("1 / 4");

    await page.keyboard.press("j");
    await expect(promptRow(page)).toContainText("j");
    // No entry name at this level contains "j", so the filtered list is
    // empty (../ still kept).
    await expect(posText(page)).toHaveText("0 / 0");
  });

  test("Enter confirms the filter (exits typing) and ArrowDown then navigates the filtered list", async ({ page }) => {
    await openEmployment(page);
    await page.keyboard.press("Enter"); // -> enaimco/
    await page.keyboard.press("Enter"); // -> enaimco/software-developer/
    await page.keyboard.press("f");
    await page.keyboard.type("time"); // matches full-time/ and part-time/

    await expect(posText(page)).toHaveText("1 / 2");

    await page.keyboard.press("Enter"); // confirm filter, back to nav mode
    await page.keyboard.press("ArrowDown");
    await expect(posText(page)).toHaveText("2 / 2");
    await expect(rowLocator(page, "part-time/")).toHaveAttribute("style", SELECTED_STYLE);
  });

  test("typed letters do nothing when NOT filtering — only arrows navigate", async ({ page }) => {
    await openEmployment(page);
    await expect(posText(page)).toHaveText("1 / 2");
    await page.keyboard.press("j");
    await expect(promptRow(page)).not.toContainText("j");
    await expect(posText(page)).toHaveText("1 / 2");
    await page.keyboard.press("ArrowDown");
    await expect(posText(page)).toHaveText("2 / 2");
  });

  test("descending from a filtered listing enters the filtered (not positionally-indexed) entry", async ({ page }) => {
    await openEmployment(page);
    await page.keyboard.press("Enter"); // -> enaimco/
    await page.keyboard.press("Enter"); // -> enaimco/software-developer/
    await page.keyboard.press("f");
    await page.keyboard.type("co"); // -> only "co-op/" (row 0 of the filtered list)
    await expect(rowLocator(page, "co-op/")).toBeVisible();
    await expect(posText(page)).toHaveText("1 / 1");

    await page.keyboard.press("Enter"); // confirm filter (still row 0)
    await page.keyboard.press("Enter"); // descend — must land on co-op/, not
    // whichever entry sits at index 0 of the full (unfiltered) list (role.md).
    await expect(rowLocator(page, "role.md")).toBeVisible();
    await expect(rowLocator(page, "full-time/")).toHaveCount(0);
  });
});

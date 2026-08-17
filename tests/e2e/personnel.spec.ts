// Behavioral e2e suite for the Personnel Files (yazi clone) view, against
// the real-content build — PLAN.md Iteration 3 Phase 1 item 1.3.
//
// Real content is now a variable-depth, path-derived tree (no more
// frontmatter `company`/`employmentType` grouping):
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
import { expect, test, type Page } from "./fixtures.ts";
// PLAN.md Phase 5B item 5B.5: this spec's `context` fixture (imported
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

/** Opens the Personnel view from the dashboard and waits for its browser
 * pane to be visible. */
async function openPersonnel(page: Page) {
  await gotoReady(page, "/");
  await page.keyboard.press("x");
  await expect(page.locator('[data-testid="personnel-path"]')).toBeVisible();
}

/** Reads a role .md file's body first line straight off disk (stripping
 * the frontmatter block), so the editor assertion below is checked against
 * ground truth, not a second copy of the same string. Personnel files start
 * with a `---`-delimited frontmatter block (unlike the repo files
 * builds.spec.ts reads), so a naive `split("\n")[0]` would return "---"
 * instead of the doc's own first line. */
function firstBodyLineOf(relPath: string): string {
  const content = readFileSync(join(ROOT, "src/content/personnel", relPath), "utf8");
  const lines = content.split("\n");
  let i = 1;
  while (lines[i] !== "---") i++;
  return lines[i + 1];
}

function rowLocator(page: Page, name: string) {
  return page.locator(`[data-testid="personnel-row"][data-row-name="${name}"]`);
}

const posText = (page: Page) => page.locator('[data-testid="personnel-pos"]');
const hintText = (page: Page) => page.locator('[data-testid="personnel-hint"]');
const pathText = (page: Page) => page.locator('[data-testid="personnel-path"]');
const upRow = (page: Page) => page.locator('[data-testid="personnel-up-row"]');
const promptRow = (page: Page) => page.locator('[data-testid="personnel-prompt"]');

test.describe("Personnel: root directory listing", () => {
  test("lists enaimco/ and memorial-university/, position indicator and hint reflect selection", async ({ page }) => {
    await openPersonnel(page);
    await expect(rowLocator(page, "enaimco/")).toBeVisible();
    await expect(rowLocator(page, "memorial-university/")).toBeVisible();
    await expect(upRow(page)).toBeVisible();

    await expect(posText(page)).toHaveText("1 / 2");
    await expect(rowLocator(page, "enaimco/")).toHaveAttribute("style", /rgba\(224, 69, 60, 0\.2\)/);
    await expect(hintText(page)).toHaveText("enter opens enaimco/ · j/k moves · Ctrl-b ? for help");
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/");
  });

  test("enaimco/ shows 4 nested roles, memorial-university/ shows 5", async ({ page }) => {
    await openPersonnel(page);
    await expect(rowLocator(page, "enaimco/")).toContainText("4 roles");
    await page.keyboard.press("j");
    await expect(rowLocator(page, "memorial-university/")).toContainText("5 roles");
  });

  test("selecting enaimco/ previews all 4 of its nested roles in the right pane", async ({ page }) => {
    await openPersonnel(page);
    const preview = page.locator('[data-testid="personnel-preview"]');
    await expect(preview).toContainText("Software Developer, Full-Time");
    await expect(preview).toContainText("Software Developer, Part-Time");
    await expect(preview).toContainText("Software Developer, Co-op");
    // The overview role (enaimco/software-developer/role.md) is also nested
    // beneath enaimco/, so its bare "Software Developer" title shows too.
    await expect(page.locator('[data-testid="personnel-role-table-row"]')).toHaveCount(4);
  });

  test("q does nothing from the root (bare q/Esc never navigate)", async ({ page }) => {
    await openPersonnel(page);
    await page.keyboard.press("q");
    await expect(page.locator('[data-testid="personnel-path"]')).toBeVisible();
  });

  test("Esc also does nothing from the root", async ({ page }) => {
    await openPersonnel(page);
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-testid="personnel-path"]')).toBeVisible();
  });

  test("clicking the ../ row returns to the dashboard", async ({ page }) => {
    await openPersonnel(page);
    await upRow(page).click();
    await expect(page.getByText("SHEVINUM.DEV")).toBeVisible();
  });

  test("Enter, l, and ArrowRight all descend into enaimco/", async ({ page }) => {
    for (const key of ["Enter", "l", "ArrowRight"]) {
      await openPersonnel(page);
      await page.keyboard.press(key);
      await expect(rowLocator(page, "software-developer/")).toBeVisible();
      await expect(pathText(page)).toHaveText("/Users/Shev/Experience/enaimco/");
    }
  });

  test("single click on the enaimco/ row descends immediately (no select-then-activate)", async ({ page }) => {
    await openPersonnel(page);
    await rowLocator(page, "enaimco/").click();
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/enaimco/");
    await expect(rowLocator(page, "software-developer/")).toBeVisible();
  });
});

test.describe("Personnel: enaimco/software-developer/ — mixed file + directory listing", () => {
  async function openEnaimcoSoftwareDeveloper(page: Page) {
    await openPersonnel(page);
    await page.keyboard.press("Enter"); // -> enaimco/
    await page.keyboard.press("Enter"); // -> enaimco/software-developer/
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/enaimco/software-developer/");
  }

  test("lists role.md FIRST, then the 3 employment-type directories", async ({ page }) => {
    await openEnaimcoSoftwareDeveloper(page);
    await expect(posText(page)).toHaveText("1 / 4");
    const rows = page.locator('[data-testid="personnel-row"]');
    await expect(rows).toHaveCount(4);
    const names = await rows.evaluateAll((els) => els.map((el) => el.getAttribute("data-row-name")));
    expect(names).toEqual(["role.md", "full-time/", "part-time/", "co-op/"]);
    await expect(rowLocator(page, "full-time/")).toContainText("1 role");
  });

  test("role.md is selected first — hint and preview reflect a FILE selection", async ({ page }) => {
    await openEnaimcoSoftwareDeveloper(page);
    await expect(hintText(page)).toHaveText("enter opens role.md in nvim · h goes back · Ctrl-b ? for help");
    await expect(page.locator('[data-testid="personnel-preview"]')).toContainText("Software Developer");
    // A file is selected, so no roles table renders.
    await expect(page.locator('[data-testid="personnel-role-table-row"]')).toHaveCount(0);
  });

  test("j moves onto full-time/ — hint and preview switch to a DIRECTORY selection", async ({ page }) => {
    await openEnaimcoSoftwareDeveloper(page);
    await page.keyboard.press("j");
    await expect(posText(page)).toHaveText("2 / 4");
    await expect(rowLocator(page, "full-time/")).toHaveAttribute("style", /rgba\(224, 69, 60, 0\.2\)/);
    await expect(hintText(page)).toHaveText("enter opens full-time/ · h goes back · Ctrl-b ? for help");
    await expect(page.locator('[data-testid="personnel-role-table-row"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="personnel-preview"]')).toContainText("Software Developer, Full-Time");
  });

  test("Enter on role.md opens the editor directly from this mixed listing", async ({ page }) => {
    await openEnaimcoSoftwareDeveloper(page);
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
  });

  test("Enter on full-time/ descends into that directory (single-file listing)", async ({ page }) => {
    await openEnaimcoSoftwareDeveloper(page);
    await page.keyboard.press("j"); // -> full-time/
    await page.keyboard.press("Enter");
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/enaimco/software-developer/full-time/");
    await expect(rowLocator(page, "role.md")).toBeVisible();
    await expect(posText(page)).toHaveText("1 / 1");
  });

  test("h and clicking ../ both walk up to enaimco/ (not the root, not the dashboard)", async ({ page }) => {
    await openEnaimcoSoftwareDeveloper(page);
    await page.keyboard.press("h");
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/enaimco/");
    await expect(rowLocator(page, "software-developer/")).toBeVisible();

    await openEnaimcoSoftwareDeveloper(page);
    await upRow(page).click();
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/enaimco/");
  });

  test("descending always starts fresh at the first row (role.md), even after a deeper visit", async ({ page }) => {
    await openEnaimcoSoftwareDeveloper(page);
    await page.keyboard.press("j"); // -> full-time/ (idx 1)
    await page.keyboard.press("h"); // -> enaimco/
    await page.keyboard.press("l"); // -> back into software-developer/, fresh selection
    await expect(posText(page)).toHaveText("1 / 4");
    await expect(rowLocator(page, "role.md")).toHaveAttribute("style", /rgba\(224, 69, 60, 0\.2\)/);
  });

  test("going up restores the ANCESTOR's own previous selection (memorial-university/ stays selected at root)", async ({
    page,
  }) => {
    await openPersonnel(page);
    await page.keyboard.press("j"); // root: select memorial-university/ (idx 1)
    await page.keyboard.press("Enter"); // descend into it
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/memorial-university/");
    await page.keyboard.press("h"); // back up to root
    await expect(posText(page)).toHaveText("2 / 2");
    await expect(rowLocator(page, "memorial-university/")).toHaveAttribute("style", /rgba\(224, 69, 60, 0\.2\)/);
  });

  test("q and Esc do nothing at this level", async ({ page }) => {
    await openEnaimcoSoftwareDeveloper(page);
    await page.keyboard.press("q");
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/enaimco/software-developer/");
    await page.keyboard.press("Escape");
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/enaimco/software-developer/");
  });

  test("gg/G jump to the first/last row", async ({ page }) => {
    await openEnaimcoSoftwareDeveloper(page);
    await page.keyboard.press("G");
    await expect(posText(page)).toHaveText("4 / 4");
    await expect(rowLocator(page, "co-op/")).toHaveAttribute("style", /rgba\(224, 69, 60, 0\.2\)/);

    await page.keyboard.press("g");
    await page.keyboard.press("g");
    await expect(posText(page)).toHaveText("1 / 4");
    await expect(rowLocator(page, "role.md")).toHaveAttribute("style", /rgba\(224, 69, 60, 0\.2\)/);
  });
});

test.describe("Personnel: role file leaves + editor", () => {
  async function openFullTimeRole(page: Page) {
    await openPersonnel(page);
    await page.keyboard.press("Enter"); // -> enaimco/
    await page.keyboard.press("Enter"); // -> enaimco/software-developer/
    await page.keyboard.press("j"); // -> full-time/
    await page.keyboard.press("Enter"); // -> enaimco/software-developer/full-time/
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/enaimco/software-developer/full-time/");
  }

  test("lists the single role.md, doc pane shows the role", async ({ page }) => {
    await openFullTimeRole(page);
    await expect(posText(page)).toHaveText("1 / 1");
    await expect(rowLocator(page, "role.md")).toBeVisible();
    await expect(hintText(page)).toHaveText("enter opens role.md in nvim · h goes back · Ctrl-b ? for help");
    await expect(page.locator('[data-testid="personnel-preview"]')).toContainText("Software Developer — Full-Time");
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
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/enaimco/software-developer/");

    await openFullTimeRole(page);
    await upRow(page).click();
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/enaimco/software-developer/");
  });

  test("q from the role file level does nothing", async ({ page }) => {
    await openFullTimeRole(page);
    await page.keyboard.press("q");
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/enaimco/software-developer/full-time/");
  });

  test("Esc from the role file level also does nothing", async ({ page }) => {
    await openFullTimeRole(page);
    await page.keyboard.press("Escape");
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/enaimco/software-developer/full-time/");
  });
});

test.describe("Personnel: memorial-university/ — 5 sibling directories, each one file deep", () => {
  async function openMemorial(page: Page) {
    await openPersonnel(page);
    await page.keyboard.press("j"); // -> memorial-university/
    await page.keyboard.press("Enter");
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/memorial-university/");
  }

  test("lists all 5 roles in order, each a single-file directory", async ({ page }) => {
    await openMemorial(page);
    await expect(posText(page)).toHaveText("1 / 5");
    const rows = page.locator('[data-testid="personnel-row"]');
    await expect(rows).toHaveCount(5);
    const names = await rows.evaluateAll((els) => els.map((el) => el.getAttribute("data-row-name")));
    expect(names).toEqual([
      "software-developer/",
      "computer-science-tutor/",
      "research-assistant/",
      "design-and-development-assistant/",
      "communications-assistant/",
    ]);
  });

  test("research-assistant/ displays the shortened title in its preview", async ({ page }) => {
    await openMemorial(page);
    await page.keyboard.press("j");
    await page.keyboard.press("j"); // -> research-assistant/
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="personnel-preview"]')).toContainText("Research Assistant");
  });
});

test.describe("Personnel: editor close paths", () => {
  async function openEditor(page: Page) {
    await openPersonnel(page);
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
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/enaimco/software-developer/");
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
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/enaimco/software-developer/");
  });

  test(":w and :wq show a readonly error IN THE CMDLINE BOX and do not close the editor", async ({ page }) => {
    // PLAN.md Phase 5C: the `:` ex-command line's presentation (typed
    // text, resulting error) moved from Editor.svelte's own footer to the
    // site-wide floating Cmdline box (src/components/Cmdline.svelte) —
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

test.describe("Personnel: filter mode", () => {
  test("f + 'co' filters enaimco/software-developer/'s listing to matching entries only", async ({ page }) => {
    await openPersonnel(page);
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

  test("clicking the > prompt row enters filter mode (mouse path — fixes 'search doesn't type')", async ({
    page,
  }) => {
    await openPersonnel(page);
    await page.keyboard.press("Enter"); // -> enaimco/
    await page.keyboard.press("Enter"); // -> enaimco/software-developer/
    await promptRow(page).click();
    await page.keyboard.type("co");
    await expect(rowLocator(page, "co-op/")).toBeVisible();
    await expect(rowLocator(page, "full-time/")).not.toBeVisible();
    await expect(promptRow(page)).toContainText("co");
  });

  test("Esc restores the full list and exits filter mode", async ({ page }) => {
    await openPersonnel(page);
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
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/enaimco/software-developer/");
  });

  test("typed 'j' while filtering types into the query instead of navigating", async ({ page }) => {
    await openPersonnel(page);
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

  test("Enter confirms the filter (exits typing) and j then navigates the filtered list", async ({ page }) => {
    await openPersonnel(page);
    await page.keyboard.press("Enter"); // -> enaimco/
    await page.keyboard.press("Enter"); // -> enaimco/software-developer/
    await page.keyboard.press("f");
    await page.keyboard.type("time"); // matches full-time/ and part-time/

    await expect(posText(page)).toHaveText("1 / 2");

    await page.keyboard.press("Enter"); // confirm filter, back to nav mode
    await page.keyboard.press("j");
    await expect(posText(page)).toHaveText("2 / 2");
    await expect(rowLocator(page, "part-time/")).toHaveAttribute("style", /rgba\(224, 69, 60, 0\.2\)/);
  });

  test("typed characters while NOT filtering still act as nav keys", async ({ page }) => {
    await openPersonnel(page);
    await expect(posText(page)).toHaveText("1 / 2");
    await page.keyboard.press("j");
    await expect(promptRow(page)).not.toContainText("j");
    await expect(posText(page)).toHaveText("2 / 2");
  });

  test("G after a filter jumps to the last entry of the filtered list, not the unfiltered one", async ({ page }) => {
    await openPersonnel(page);
    await page.keyboard.press("Enter"); // -> enaimco/
    await page.keyboard.press("Enter"); // -> enaimco/software-developer/ (4 entries)
    await page.keyboard.press("f");
    await page.keyboard.type("time"); // matches full-time/ and part-time/ (2 of 4)
    await page.keyboard.press("Enter"); // confirm filter, back to nav mode
    await expect(posText(page)).toHaveText("1 / 2");

    await page.keyboard.press("G");
    await expect(posText(page)).toHaveText("2 / 2");
    await expect(rowLocator(page, "part-time/")).toHaveAttribute("style", /rgba\(224, 69, 60, 0\.2\)/);
    // Not the unfiltered list's last entry.
    await expect(rowLocator(page, "co-op/")).not.toBeVisible();

    await page.keyboard.press("g");
    await page.keyboard.press("g");
    await expect(posText(page)).toHaveText("1 / 2");
    await expect(rowLocator(page, "full-time/")).toHaveAttribute("style", /rgba\(224, 69, 60, 0\.2\)/);
  });

  test("descending from a filtered listing enters the filtered (not positionally-indexed) entry", async ({
    page,
  }) => {
    await openPersonnel(page);
    await page.keyboard.press("Enter"); // -> enaimco/
    await page.keyboard.press("Enter"); // -> enaimco/software-developer/
    await page.keyboard.press("f");
    await page.keyboard.type("co"); // -> only "co-op/" (row 0 of the filtered list)
    await expect(rowLocator(page, "co-op/")).toBeVisible();
    await expect(posText(page)).toHaveText("1 / 1");

    await page.keyboard.press("Enter"); // confirm filter (still row 0)
    await page.keyboard.press("Enter"); // descend — must land on co-op/, not
    // whichever entry sits at index 0 of the full (unfiltered) list (role.md).
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/enaimco/software-developer/co-op/");
    await expect(rowLocator(page, "role.md")).toBeVisible();
  });
});

test.describe("Personnel: mouse-only walkthrough", () => {
  test("click enaimco -> software-developer -> full-time -> role.md opens the editor, entirely by mouse", async ({
    page,
  }) => {
    await openPersonnel(page);
    await rowLocator(page, "enaimco/").click();
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/enaimco/");

    await rowLocator(page, "software-developer/").click();
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/enaimco/software-developer/");

    await rowLocator(page, "full-time/").click();
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/enaimco/software-developer/full-time/");

    await rowLocator(page, "role.md").click();
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
  });

  test("../ clicks walk all the way back up: role file -> mixed listing -> enaimco -> root -> dashboard", async ({
    page,
  }) => {
    await openPersonnel(page);
    await rowLocator(page, "enaimco/").click();
    await rowLocator(page, "software-developer/").click();
    await rowLocator(page, "full-time/").click();
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/enaimco/software-developer/full-time/");

    await upRow(page).click(); // full-time/ -> enaimco/software-developer/
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/enaimco/software-developer/");
    await expect(rowLocator(page, "full-time/")).toBeVisible();

    await upRow(page).click(); // -> enaimco/
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/enaimco/");
    await expect(rowLocator(page, "software-developer/")).toBeVisible();

    await upRow(page).click(); // -> root
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/");
    await expect(rowLocator(page, "enaimco/")).toBeVisible();

    await upRow(page).click(); // root -> dashboard
    await expect(page.getByText("SHEVINUM.DEV")).toBeVisible();
  });
});

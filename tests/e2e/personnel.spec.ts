// Behavioral e2e suite for the Personnel Files (yazi clone) view, against
// the real-content build — PLAN.md Phase 2 (Iteration 2), items 7/8/9.
//
// Real content: Enaimco-only (Vretta/Ontario-Tech/Freelance and their role
// content were DELETED, not hidden — PLAN.md "User decisions (locked)" #1),
// 3 levels deep: companies -> employment types -> role files. Enaimco has
// 3 employment types (Full-Time, Part-Time, Co-op — src/data/companies.yaml
// order + src/content/personnel/Enaimco/**/*.md `order` frontmatter), each
// with exactly 1 role file named `software-developer.md`.
import { expect, test, type Page } from "@playwright/test";
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

test.describe("Personnel: companies level (level 0)", () => {
  test("lists Enaimco only, position indicator and hint reflect selection", async ({ page }) => {
    await openPersonnel(page);
    await expect(rowLocator(page, "Enaimco/")).toBeVisible();
    await expect(upRow(page)).toBeVisible();

    await expect(posText(page)).toHaveText("1 / 1");
    await expect(rowLocator(page, "Enaimco/")).toHaveAttribute("style", /rgba\(224, 69, 60, 0\.2\)/);
    await expect(hintText(page)).toHaveText("enter opens Enaimco/ · j/k moves · Ctrl-b ? for help");
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/");
  });

  test("selecting the company previews its full roles table (all 3 employment types) in the right pane", async ({
    page,
  }) => {
    await openPersonnel(page);
    const preview = page.locator('[data-testid="personnel-preview"]');
    await expect(preview).toContainText("Software Developer, Full Time");
    await expect(preview).toContainText("Software Developer, Part Time");
    await expect(preview).toContainText("Software Developer, Co-op");
  });

  test("q does nothing from the companies level (PLAN.md Phase 1 items 15/16)", async ({ page }) => {
    await openPersonnel(page);
    await page.keyboard.press("q");
    await expect(page.locator('[data-testid="personnel-path"]')).toBeVisible();
  });

  test("Esc also does nothing from the companies level", async ({ page }) => {
    await openPersonnel(page);
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-testid="personnel-path"]')).toBeVisible();
  });

  test("clicking the ../ row returns to the dashboard", async ({ page }) => {
    await openPersonnel(page);
    await upRow(page).click();
    await expect(page.getByText("SHEVINUM.DEV")).toBeVisible();
  });

  test("Enter, l, and ArrowRight all descend into Enaimco's employment types", async ({ page }) => {
    for (const key of ["Enter", "l", "ArrowRight"]) {
      await openPersonnel(page);
      await page.keyboard.press(key);
      await expect(rowLocator(page, "Full-Time/")).toBeVisible();
      await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/");
    }
  });

  test("single click on the Enaimco row descends immediately (no select-then-activate)", async ({ page }) => {
    await openPersonnel(page);
    await rowLocator(page, "Enaimco/").click();
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/");
    await expect(rowLocator(page, "Full-Time/")).toBeVisible();
  });
});

test.describe("Personnel: employment types level (level 1)", () => {
  async function openEnaimcoTypes(page: Page) {
    await openPersonnel(page);
    await page.keyboard.press("Enter");
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/");
  }

  test("lists the 3 employment types in role order, each showing a role count", async ({ page }) => {
    await openEnaimcoTypes(page);
    await expect(posText(page)).toHaveText("1 / 3");
    await expect(rowLocator(page, "Full-Time/")).toBeVisible();
    await expect(rowLocator(page, "Part-Time/")).toBeVisible();
    await expect(rowLocator(page, "Co-op/")).toBeVisible();
    await expect(rowLocator(page, "Full-Time/")).toContainText("1 role");
    await expect(hintText(page)).toHaveText("enter opens Full-Time/ · h goes back · Ctrl-b ? for help");
  });

  test("j/k moves selection and updates the hint", async ({ page }) => {
    await openEnaimcoTypes(page);
    await page.keyboard.press("j");
    await expect(posText(page)).toHaveText("2 / 3");
    await expect(rowLocator(page, "Part-Time/")).toHaveAttribute("style", /rgba\(224, 69, 60, 0\.2\)/);
    await expect(hintText(page)).toHaveText("enter opens Part-Time/ · h goes back · Ctrl-b ? for help");

    await page.keyboard.press("k");
    await expect(posText(page)).toHaveText("1 / 3");
  });

  test("selecting a type previews only that type's role(s) in the right pane", async ({ page }) => {
    await openEnaimcoTypes(page);
    const preview = page.locator('[data-testid="personnel-preview"]');
    await expect(preview).toContainText("Software Developer, Full Time");
    await expect(preview).not.toContainText("Part Time");
    await expect(preview).not.toContainText("Co-op");

    await page.keyboard.press("j"); // -> Part-Time
    await expect(preview).toContainText("Software Developer, Part Time");
    await expect(preview).not.toContainText("Full Time");
  });

  test("Enter, l, and ArrowRight all descend into the type's role files", async ({ page }) => {
    for (const key of ["Enter", "l", "ArrowRight"]) {
      await openEnaimcoTypes(page);
      await page.keyboard.press(key); // -> Full-Time roles
      await expect(rowLocator(page, "software-developer.md")).toBeVisible();
      await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/Full-Time/");
    }
  });

  test("single click on a type row descends immediately", async ({ page }) => {
    await openEnaimcoTypes(page);
    await rowLocator(page, "Co-op/").click();
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/Co-op/");
    await expect(rowLocator(page, "software-developer.md")).toBeVisible();
  });

  test("h and clicking ../ both walk up to the companies level (not the dashboard)", async ({ page }) => {
    await openEnaimcoTypes(page);
    await page.keyboard.press("h");
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/");
    await expect(rowLocator(page, "Enaimco/")).toBeVisible();

    await openEnaimcoTypes(page);
    await upRow(page).click();
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/");
  });

  test("Backspace and ArrowLeft also walk up one level only", async ({ page }) => {
    for (const key of ["Backspace", "ArrowLeft"]) {
      await openEnaimcoTypes(page);
      await page.keyboard.press(key);
      await expect(pathText(page)).toHaveText("/Users/Shev/Experience/");
    }
  });

  test("q and Esc do nothing at the types level (PLAN.md Phase 1 items 15/16)", async ({ page }) => {
    await openEnaimcoTypes(page);
    await page.keyboard.press("q");
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/");

    await page.keyboard.press("Escape");
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/");
  });

  test("gg/G jump to the first/last type", async ({ page }) => {
    await openEnaimcoTypes(page);
    await expect(posText(page)).toHaveText("1 / 3");

    await page.keyboard.press("G");
    await expect(posText(page)).toHaveText("3 / 3");
    await expect(rowLocator(page, "Co-op/")).toHaveAttribute("style", /rgba\(224, 69, 60, 0\.2\)/);

    await page.keyboard.press("g");
    await page.keyboard.press("g");
    await expect(posText(page)).toHaveText("1 / 3");
    await expect(rowLocator(page, "Full-Time/")).toHaveAttribute("style", /rgba\(224, 69, 60, 0\.2\)/);
  });
});

test.describe("Personnel: role files level (level 2)", () => {
  async function openFullTimeRoles(page: Page) {
    await openPersonnel(page);
    await page.keyboard.press("Enter"); // -> types
    await page.keyboard.press("Enter"); // -> Full-Time's role files
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/Full-Time/");
  }

  test("lists the type's role file(s), doc pane shows the role", async ({ page }) => {
    await openFullTimeRoles(page);
    await expect(posText(page)).toHaveText("1 / 1");
    await expect(rowLocator(page, "software-developer.md")).toBeVisible();
    await expect(hintText(page)).toHaveText(
      "enter opens software-developer.md in nvim · h goes back · Ctrl-b ? for help",
    );
    await expect(page.locator('[data-testid="personnel-preview"]')).toContainText("Software Developer — Full Time");
  });

  test("Enter opens the editor; first line matches the role .md body first line on disk", async ({ page }) => {
    await openFullTimeRoles(page);
    await page.keyboard.press("Enter");
    const firstLine = page.locator('[data-line="1"] [data-testid="editor-line-text"]');
    await expect(firstLine).toHaveText(firstBodyLineOf("Enaimco/Full-Time/software-developer.md"));
  });

  test("l and ArrowRight also open the editor (descend parity with Enter)", async ({ page }) => {
    for (const key of ["l", "ArrowRight"]) {
      await openFullTimeRoles(page);
      await page.keyboard.press(key);
      await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
    }
  });

  test("single click on the role row opens the editor immediately", async ({ page }) => {
    await openFullTimeRoles(page);
    await rowLocator(page, "software-developer.md").click();
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
  });

  test("h and clicking ../ both walk up to the types level (not companies, not the dashboard)", async ({ page }) => {
    await openFullTimeRoles(page);
    await page.keyboard.press("h");
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/");
    await expect(rowLocator(page, "Full-Time/")).toBeVisible();

    await openFullTimeRoles(page);
    await upRow(page).click();
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/");
  });

  test("q from the role files level does nothing (PLAN.md Phase 1 items 15/16)", async ({ page }) => {
    await openFullTimeRoles(page);
    await page.keyboard.press("q");
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/Full-Time/");
  });

  test("Esc from the role files level also does nothing", async ({ page }) => {
    await openFullTimeRoles(page);
    await page.keyboard.press("Escape");
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/Full-Time/");
  });
});

test.describe("Personnel: editor", () => {
  async function openEditor(page: Page) {
    await openPersonnel(page);
    await page.keyboard.press("Enter"); // -> types
    await page.keyboard.press("Enter"); // -> Full-Time roles
    await page.keyboard.press("Enter"); // -> editor
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
  }

  test("q does nothing in the editor (PLAN.md Phase 1 items 15/16 + Phase 3: :q is the only close path)", async ({
    page,
  }) => {
    await openEditor(page);
    await page.keyboard.press("q");
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
  });

  test("bare Esc in NORMAL mode does nothing — the editor stays open", async ({ page }) => {
    await openEditor(page);
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
  });

  test(":q closes the editor back to the role files level, not the dashboard", async ({ page }) => {
    await openEditor(page);
    await page.keyboard.press(":");
    await page.keyboard.type("q");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="editor-scroller"]')).not.toBeVisible();
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/Full-Time/");
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
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/Full-Time/");
  });

  test(":w and :wq show a readonly error and do not close the editor", async ({ page }) => {
    await openEditor(page);
    await page.keyboard.press(":");
    await page.keyboard.type("w");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
    await expect(page.locator('[data-testid="editor-message"]')).toContainText("readonly");

    await page.keyboard.press(":");
    await page.keyboard.type("wq");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
  });

  test("an unknown ex command shows an E492-style error", async ({ page }) => {
    await openEditor(page);
    await page.keyboard.press(":");
    await page.keyboard.type("bogus");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="editor-message"]')).toContainText("E492");
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
  test("f + 'co' filters the types list to matching entries only, position indicator updates", async ({ page }) => {
    await openPersonnel(page);
    await page.keyboard.press("Enter"); // -> Enaimco types (3 entries)
    await expect(posText(page)).toHaveText("1 / 3");

    await page.keyboard.press("f");
    await page.keyboard.type("co");
    await expect(rowLocator(page, "Co-op/")).toBeVisible();
    await expect(rowLocator(page, "Full-Time/")).not.toBeVisible();
    await expect(rowLocator(page, "Part-Time/")).not.toBeVisible();
    // `../` is always kept regardless of the query.
    await expect(upRow(page)).toBeVisible();
    await expect(posText(page)).toHaveText("1 / 1");
    await expect(promptRow(page)).toContainText("co");
  });

  test("clicking the > prompt row enters filter mode (mouse path — fixes 'search doesn't type')", async ({
    page,
  }) => {
    await openPersonnel(page);
    await page.keyboard.press("Enter"); // -> Enaimco types
    await promptRow(page).click();
    await page.keyboard.type("co");
    await expect(rowLocator(page, "Co-op/")).toBeVisible();
    await expect(rowLocator(page, "Full-Time/")).not.toBeVisible();
    await expect(promptRow(page)).toContainText("co");
  });

  test("Esc restores the full list and exits filter mode", async ({ page }) => {
    await openPersonnel(page);
    await page.keyboard.press("Enter");
    await page.keyboard.press("f");
    await page.keyboard.type("co");
    await expect(posText(page)).toHaveText("1 / 1");

    await page.keyboard.press("Escape");
    await expect(posText(page)).toHaveText("1 / 3");
    await expect(rowLocator(page, "Full-Time/")).toBeVisible();
    await expect(rowLocator(page, "Part-Time/")).toBeVisible();
    await expect(rowLocator(page, "Co-op/")).toBeVisible();
    // Esc, having exited filter mode rather than left the view, must not
    // also trigger any navigation.
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/");
  });

  test("typed 'j' while filtering types into the query instead of navigating", async ({ page }) => {
    await openPersonnel(page);
    await page.keyboard.press("Enter");
    await page.keyboard.press("f");
    await expect(posText(page)).toHaveText("1 / 3");

    await page.keyboard.press("j");
    await expect(promptRow(page)).toContainText("j");
    // No employment type name contains "j", so the filtered list is empty
    // (../ still kept).
    await expect(posText(page)).toHaveText("0 / 0");
  });

  test("Enter confirms the filter (exits typing) and j then navigates the filtered list", async ({ page }) => {
    await openPersonnel(page);
    await page.keyboard.press("Enter"); // -> Enaimco types
    await page.keyboard.press("f");
    await page.keyboard.type("time"); // matches Full-Time/ and Part-Time/

    await expect(posText(page)).toHaveText("1 / 2");

    await page.keyboard.press("Enter"); // confirm filter, back to nav mode
    await page.keyboard.press("j");
    await expect(posText(page)).toHaveText("2 / 2");
    await expect(rowLocator(page, "Part-Time/")).toHaveAttribute("style", /rgba\(224, 69, 60, 0\.2\)/);
  });

  test("typed characters while NOT filtering still act as nav keys", async ({ page }) => {
    await openPersonnel(page);
    await expect(posText(page)).toHaveText("1 / 1");
    // Single company, so j/k are no-ops here, but the key must still be
    // consumed as navigation, not typed into any query.
    await page.keyboard.press("j");
    await expect(promptRow(page)).not.toContainText("j");
  });

  // PLAN.md Phase 9 "Vim extras" — "filtered list aware": G must jump to
  // the last entry of the FILTERED set, not the last entry of the
  // unfiltered types list (Co-op, which the "time" filter excludes).
  test("G after a filter jumps to the last entry of the filtered list, not the unfiltered one", async ({ page }) => {
    await openPersonnel(page);
    await page.keyboard.press("Enter"); // -> Enaimco types (3 entries)
    await page.keyboard.press("f");
    await page.keyboard.type("time"); // matches Full-Time/ and Part-Time/ (2 of 3)
    await page.keyboard.press("Enter"); // confirm filter, back to nav mode
    await expect(posText(page)).toHaveText("1 / 2");

    await page.keyboard.press("G");
    await expect(posText(page)).toHaveText("2 / 2");
    await expect(rowLocator(page, "Part-Time/")).toHaveAttribute("style", /rgba\(224, 69, 60, 0\.2\)/);
    // Not the unfiltered list's last entry.
    await expect(rowLocator(page, "Co-op/")).not.toBeVisible();

    await page.keyboard.press("g");
    await page.keyboard.press("g");
    await expect(posText(page)).toHaveText("1 / 2");
    await expect(rowLocator(page, "Full-Time/")).toHaveAttribute("style", /rgba\(224, 69, 60, 0\.2\)/);
  });

  test("descending from a filtered types list enters the filtered (not positionally-indexed) type", async ({
    page,
  }) => {
    await openPersonnel(page);
    await page.keyboard.press("Enter"); // -> Enaimco types
    await page.keyboard.press("f");
    await page.keyboard.type("co"); // -> only "Co-op/" (row 0 of the filtered list)
    await expect(rowLocator(page, "Co-op/")).toBeVisible();
    await expect(posText(page)).toHaveText("1 / 1");

    await page.keyboard.press("Enter"); // confirm filter (still row 0)
    await page.keyboard.press("Enter"); // descend — must land on Co-op, not
    // whichever type sits at index 0 of the full (unfiltered) list (Full-Time).
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/Co-op/");
    await expect(rowLocator(page, "software-developer.md")).toBeVisible();
  });
});

test.describe("Personnel: mouse-only walkthrough (PLAN.md Phase 2 item 9)", () => {
  test("click Enaimco -> Full-Time -> software-developer.md opens the editor, entirely by mouse", async ({
    page,
  }) => {
    await openPersonnel(page);
    await rowLocator(page, "Enaimco/").click();
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/");

    await rowLocator(page, "Full-Time/").click();
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/Full-Time/");

    await rowLocator(page, "software-developer.md").click();
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
  });

  test("../ clicks walk all the way back up: roles -> types -> companies -> dashboard", async ({ page }) => {
    await openPersonnel(page);
    await rowLocator(page, "Enaimco/").click();
    await rowLocator(page, "Full-Time/").click();
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/Full-Time/");

    await upRow(page).click(); // roles -> types
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/");
    await expect(rowLocator(page, "Full-Time/")).toBeVisible();

    await upRow(page).click(); // types -> companies
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/");
    await expect(rowLocator(page, "Enaimco/")).toBeVisible();

    await upRow(page).click(); // companies root -> dashboard
    await expect(page.getByText("SHEVINUM.DEV")).toBeVisible();
  });
});

// Behavioral e2e suite for the Personnel Files (yazi clone) view, against
// the real-content build — PLAN.md Phase 6.
//
// Real content: 4 companies (Enaimco, Vretta, Ontario-Tech, Freelance —
// src/data/companies.yaml order), Enaimco has 3 roles (full-time, part-time,
// co-op — src/content/personnel/Enaimco/*.md `order` frontmatter), the
// other 3 companies have 1-2 roles each. All content is the prototype's own
// `xp` sample data extracted verbatim (PLAN.md Architecture note — no
// fixture-switching for personnel).
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

test.describe("Personnel: companies level (level 0)", () => {
  test("lists companies in companies.yaml order, position indicator and hint reflect selection", async ({ page }) => {
    await openPersonnel(page);
    await expect(rowLocator(page, "Enaimco/")).toBeVisible();
    await expect(rowLocator(page, "Vretta/")).toBeVisible();
    await expect(rowLocator(page, "Ontario-Tech/")).toBeVisible();
    await expect(rowLocator(page, "Freelance/")).toBeVisible();
    await expect(page.locator('[data-testid="personnel-up-row"]')).toBeVisible();

    await expect(posText(page)).toHaveText("1 / 4");
    await expect(rowLocator(page, "Enaimco/")).toHaveAttribute("style", /rgba\(224, 69, 60, 0\.2\)/);
    await expect(hintText(page)).toHaveText("enter opens Enaimco/ · j/k moves · q returns to the dashboard");
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/");
  });

  test("j/k wraps (including up past the first / past the last entry)", async ({ page }) => {
    await openPersonnel(page);
    await expect(posText(page)).toHaveText("1 / 4");

    await page.keyboard.press("k"); // wraps up from first -> last
    await expect(posText(page)).toHaveText("4 / 4");
    await expect(rowLocator(page, "Freelance/")).toHaveAttribute("style", /rgba\(224, 69, 60, 0\.2\)/);
    await expect(hintText(page)).toHaveText("enter opens Freelance/ · j/k moves · q returns to the dashboard");

    await page.keyboard.press("j"); // wraps down from last -> first
    await expect(posText(page)).toHaveText("1 / 4");

    await page.keyboard.press("j");
    await expect(posText(page)).toHaveText("2 / 4");
    await expect(rowLocator(page, "Vretta/")).toHaveAttribute("style", /rgba\(224, 69, 60, 0\.2\)/);
  });

  test("selecting a company previews its roles table in the right pane", async ({ page }) => {
    await openPersonnel(page);
    const preview = page.locator('[data-testid="personnel-preview"]');
    await expect(preview).toContainText("Software Developer, Full Time");
    await expect(preview).toContainText("Software Developer, Part Time");
    await expect(preview).toContainText("Software Developer, Co-op");

    await page.keyboard.press("j"); // -> Vretta
    await expect(preview).toContainText("QA Automation Intern");
    await expect(preview).not.toContainText("Software Developer");
  });

  test("q returns to the dashboard (bug fix 3) from the companies level", async ({ page }) => {
    await openPersonnel(page);
    await page.keyboard.press("q");
    await expect(page.locator('[data-testid="personnel-path"]')).not.toBeVisible();
    await expect(page.getByText("SHEVINUM.DEV")).toBeVisible();
  });

  test("Esc also returns to the dashboard from the companies level", async ({ page }) => {
    await openPersonnel(page);
    await page.keyboard.press("Escape");
    await expect(page.getByText("SHEVINUM.DEV")).toBeVisible();
  });

  test("clicking the ../ row returns to the dashboard", async ({ page }) => {
    await openPersonnel(page);
    await page.locator('[data-testid="personnel-up-row"]').click();
    await expect(page.getByText("SHEVINUM.DEV")).toBeVisible();
  });

  test("Enter, l, and ArrowRight all descend into the selected company's roles", async ({ page }) => {
    for (const key of ["Enter", "l", "ArrowRight"]) {
      await openPersonnel(page);
      await page.keyboard.press(key);
      await expect(rowLocator(page, "software-developer-full-time.md")).toBeVisible();
      await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/");
    }
  });
});

test.describe("Personnel: roles level (level 1)", () => {
  async function openEnaimcoRoles(page: Page) {
    await openPersonnel(page);
    await page.keyboard.press("Enter");
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/");
  }

  test("lists the company's role files, roleSel resets to 0, doc pane shows the first role", async ({ page }) => {
    await openEnaimcoRoles(page);
    await expect(posText(page)).toHaveText("1 / 3");
    await expect(hintText(page)).toHaveText(
      "enter opens software-developer-full-time.md in nvim · h goes back · q returns to the dashboard",
    );
    await expect(page.locator('[data-testid="personnel-preview"]')).toContainText("Software Developer — Full Time");
  });

  test("j/k moves selection and changes the doc pane + hint", async ({ page }) => {
    await openEnaimcoRoles(page);
    await page.keyboard.press("j");
    await expect(posText(page)).toHaveText("2 / 3");
    await expect(hintText(page)).toHaveText(
      "enter opens software-developer-part-time.md in nvim · h goes back · q returns to the dashboard",
    );
    await expect(page.locator('[data-testid="personnel-preview"]')).toContainText("Software Developer — Part Time");

    await page.keyboard.press("k");
    await expect(posText(page)).toHaveText("1 / 3");
  });

  test("Enter opens the editor; first line matches the role .md body first line on disk", async ({ page }) => {
    await openEnaimcoRoles(page);
    await page.keyboard.press("Enter");
    const firstLine = page.locator('[data-line="1"] [data-testid="editor-line-text"]');
    await expect(firstLine).toHaveText(firstBodyLineOf("Enaimco/software-developer-full-time.md"));
  });

  test("l and ArrowRight also open the editor (descend parity with Enter)", async ({ page }) => {
    for (const key of ["l", "ArrowRight"]) {
      await openEnaimcoRoles(page);
      await page.keyboard.press(key);
      await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
    }
  });

  test("h and clicking ../ both walk up to the companies level (not the dashboard)", async ({ page }) => {
    await openEnaimcoRoles(page);
    await page.keyboard.press("h");
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/");
    await expect(rowLocator(page, "Enaimco/")).toBeVisible();

    await openEnaimcoRoles(page);
    await page.locator('[data-testid="personnel-up-row"]').click();
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/");
  });

  test("Backspace and ArrowLeft also walk up one level only", async ({ page }) => {
    for (const key of ["Backspace", "ArrowLeft"]) {
      await openEnaimcoRoles(page);
      await page.keyboard.press(key);
      await expect(pathText(page)).toHaveText("/Users/Shev/Experience/");
    }
  });

  test("q from the roles level goes all the way to the dashboard (bug fix 3 regression)", async ({ page }) => {
    await openEnaimcoRoles(page);
    await page.keyboard.press("q");
    await expect(page.getByText("SHEVINUM.DEV")).toBeVisible();
  });

  test("Esc from the roles level also goes to the dashboard", async ({ page }) => {
    await openEnaimcoRoles(page);
    await page.keyboard.press("Escape");
    await expect(page.getByText("SHEVINUM.DEV")).toBeVisible();
  });
});

test.describe("Personnel: editor", () => {
  async function openEditor(page: Page) {
    await openPersonnel(page);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="editor-scroller"]')).toBeVisible();
  }

  test("q closes the editor back to the browser (roles level), not the dashboard", async ({ page }) => {
    await openEditor(page);
    await page.keyboard.press("q");
    await expect(page.locator('[data-testid="editor-scroller"]')).not.toBeVisible();
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/");
  });

  test("Esc also closes the editor back to the browser", async ({ page }) => {
    await openEditor(page);
    await page.keyboard.press("Escape");
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/");
  });
});

test.describe("Personnel: filter mode", () => {
  test("f + 'co' filters the roles list to matching entries only, position indicator updates", async ({ page }) => {
    await openPersonnel(page);
    await page.keyboard.press("Enter"); // -> Enaimco roles (3 entries)
    await expect(posText(page)).toHaveText("1 / 3");

    await page.keyboard.press("f");
    await page.keyboard.type("co");
    await expect(rowLocator(page, "software-developer-co-op.md")).toBeVisible();
    await expect(rowLocator(page, "software-developer-full-time.md")).not.toBeVisible();
    await expect(rowLocator(page, "software-developer-part-time.md")).not.toBeVisible();
    // `../` is always kept regardless of the query.
    await expect(page.locator('[data-testid="personnel-up-row"]')).toBeVisible();
    await expect(posText(page)).toHaveText("1 / 1");
    await expect(page.locator('[data-testid="personnel-prompt"]')).toContainText("co");
  });

  test("Esc restores the full list and exits filter mode", async ({ page }) => {
    await openPersonnel(page);
    await page.keyboard.press("Enter");
    await page.keyboard.press("f");
    await page.keyboard.type("co");
    await expect(posText(page)).toHaveText("1 / 1");

    await page.keyboard.press("Escape");
    await expect(posText(page)).toHaveText("1 / 3");
    await expect(rowLocator(page, "software-developer-full-time.md")).toBeVisible();
    await expect(rowLocator(page, "software-developer-part-time.md")).toBeVisible();
    await expect(rowLocator(page, "software-developer-co-op.md")).toBeVisible();
    // Esc, having exited filter mode rather than left the view, must not
    // also trigger the dashboard fallback.
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Enaimco/");
  });

  test("typed 'j' while filtering types into the query instead of navigating", async ({ page }) => {
    await openPersonnel(page);
    await page.keyboard.press("Enter");
    await page.keyboard.press("f");
    await expect(posText(page)).toHaveText("1 / 3");

    await page.keyboard.press("j");
    await expect(page.locator('[data-testid="personnel-prompt"]')).toContainText("j");
    // No role name contains "j", so the filtered list is empty (../ still kept).
    await expect(posText(page)).toHaveText("0 / 0");
  });

  test("Enter confirms the filter (exits typing) and j then navigates the filtered list", async ({ page }) => {
    await openPersonnel(page);
    await page.keyboard.press("Enter"); // -> Enaimco roles
    await page.keyboard.press("f");
    await page.keyboard.type("time"); // matches full-time.md and part-time.md
    await expect(posText(page)).toHaveText("1 / 2");

    await page.keyboard.press("Enter"); // confirm filter, back to nav mode
    await page.keyboard.press("j");
    await expect(posText(page)).toHaveText("2 / 2");
    await expect(rowLocator(page, "software-developer-part-time.md")).toHaveAttribute(
      "style",
      /rgba\(224, 69, 60, 0\.2\)/,
    );
  });

  test("typed characters while NOT filtering still act as nav keys", async ({ page }) => {
    await openPersonnel(page);
    await expect(posText(page)).toHaveText("1 / 4");
    await page.keyboard.press("j");
    await expect(posText(page)).toHaveText("2 / 4");
  });

  test("descending from a filtered companies list enters the filtered (not positionally-indexed) company", async ({
    page,
  }) => {
    await openPersonnel(page);
    await page.keyboard.press("f");
    await page.keyboard.type("fre"); // -> only "Freelance/" (row 0 of the filtered list)
    await expect(rowLocator(page, "Freelance/")).toBeVisible();
    await expect(posText(page)).toHaveText("1 / 1");

    await page.keyboard.press("Enter"); // confirm filter (still row 0)
    await page.keyboard.press("Enter"); // descend — must land on Freelance, not
    // whichever company sits at index 0 of the full (unfiltered) list (Enaimco).
    await expect(pathText(page)).toHaveText("/Users/Shev/Experience/Freelance/");
    await expect(rowLocator(page, "full-stack-contractor.md")).toBeVisible();
  });
});

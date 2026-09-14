// Pixel-regression suite for the 2 recipes EmploymentRecords.svelte owns
// ("04-employment-l0", "05-employment-l1").
//
// Every recipe is captured exactly once, by exactly one context.
//
// Goldens
// resolve via this project's own `snapshotPathTemplate` — see
// playwright.config.ts's `common-visual` project comment for why
// `{projectName}` can't be used here.
import { expect, test } from "@playwright/test";
import { recipes } from "../../../../../common/tests/ui/support/recipes";
import { captureState } from "../../../../../common/tests/ui/support/pipeline.mjs";

const EMPLOYMENT_OWNED_RECIPE_NAMES = new Set(["04-employment-l0", "05-employment-l1"]);
const keyRecipes = recipes.filter((recipe) => EMPLOYMENT_OWNED_RECIPE_NAMES.has(recipe.name));

test.describe("visual (employment): implementation vs goldens", () => {
  test.beforeEach(async ({ page }) => {
    // Aborts api.github.com so the commit-refresh island's fetch doesn't depend on network luck.
    await page.route("**/api.github.com/**", (route) => route.abort());
  });

  for (const recipe of keyRecipes) {
    test(recipe.name, async ({ page, baseURL }) => {
      const png = await captureState(page, baseURL ?? "http://localhost:4322", recipe);
      expect(png).toMatchSnapshot({ name: `${recipe.name}.png`, maxDiffPixels: 0 });
    });
  }
});

// Captures only the recipes common owns (COMMON_OWNED_RECIPE_NAMES below); every recipe belongs to exactly one context's split, so each recipe is goldened exactly once.
import { expect, test } from "@playwright/test";
import { cmdlineRecipes, iteration3Recipes, recipes } from "../support/recipes";
import { captureState } from "../support/pipeline.mjs";

const COMMON_OWNED_RECIPE_NAMES = new Set(["06-editor", "15-cmdline", "18-split", "19-choose-tree", "08-tracker"]);
const keyRecipes = [...recipes, ...cmdlineRecipes, ...iteration3Recipes].filter((recipe) =>
  COMMON_OWNED_RECIPE_NAMES.has(recipe.name),
);

test.describe("visual (common): implementation vs goldens", () => {
  test.beforeEach(async ({ page }) => {
    // Abort api.github.com: the Repositories view fetches it on mount, and fixture captures must not depend on that request failing by luck.
    await page.route("**/api.github.com/**", (route) => route.abort());
  });

  for (const recipe of keyRecipes) {
    test(recipe.name, async ({ page, baseURL }) => {
      const png = await captureState(page, baseURL ?? "http://localhost:4322", recipe);
      expect(png).toMatchSnapshot({ name: `${recipe.name}.png`, maxDiffPixels: 0 });
    });
  }
});

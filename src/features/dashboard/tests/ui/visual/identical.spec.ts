// Pixel-regression suite for the "01-dashboard" recipe only; see
// src/common/tests/ui/support/pipeline.mjs and recipes.ts for the shared
// capture mechanism this reuses.
import { expect, test } from "@playwright/test";
import { recipes } from "../../../../../common/tests/ui/support/recipes";
import { captureState } from "../../../../../common/tests/ui/support/pipeline.mjs";

const DASHBOARD_OWNED_RECIPE_NAMES = new Set(["01-dashboard"]);
const keyRecipes = recipes.filter((recipe) => DASHBOARD_OWNED_RECIPE_NAMES.has(recipe.name));

test.describe("visual (dashboard): implementation vs goldens", () => {
  test.beforeEach(async ({ page }) => {
    // Same network-determinism rule as tests/visual/identical.spec.ts /
    // src/common/tests/ui/support/capture-goldens.mjs: the commit-refresh
    // island fires a fetch on Repositories mount, and fixture repos must not
    // depend on api.github.com 404-ing by luck.
    await page.route("**/api.github.com/**", (route) => route.abort());
  });

  for (const recipe of keyRecipes) {
    test(recipe.name, async ({ page, baseURL }) => {
      const png = await captureState(page, baseURL ?? "http://localhost:4322", recipe);
      expect(png).toMatchSnapshot({ name: `${recipe.name}.png`, maxDiffPixels: 0 });
    });
  }
});

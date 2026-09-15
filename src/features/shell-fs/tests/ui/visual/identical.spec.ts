// Goldens resolve via this project's own `snapshotPathTemplate` — see
// playwright.config.ts's `common-visual` project comment for why
// `{projectName}` can't be used here.
import { expect, test } from "@playwright/test";
import { iteration3Recipes } from "../../../../../common/tests/ui/support/recipes";
import { captureState } from "../../../../../common/tests/ui/support/pipeline.mjs";

const SHELL_FS_OWNED_RECIPE_NAMES = new Set(["16-shell", "17-host-shell"]);
const keyRecipes = iteration3Recipes.filter((recipe) =>
  SHELL_FS_OWNED_RECIPE_NAMES.has(recipe.name),
);

test.describe("visual (shell-fs): implementation vs goldens", () => {
  test.beforeEach(async ({ page }) => {
    // Aborts api.github.com so the commit-refresh island's fetch doesn't
    // depend on network luck.
    await page.route("**/api.github.com/**", (route) => route.abort());
  });

  for (const recipe of keyRecipes) {
    test(recipe.name, async ({ page, baseURL }) => {
      const png = await captureState(page, baseURL ?? "http://localhost:4322", recipe);
      expect(png).toMatchSnapshot({ name: `${recipe.name}.png`, maxDiffPixels: 0 });
    });
  }
});

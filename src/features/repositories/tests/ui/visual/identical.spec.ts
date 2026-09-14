// Pixel-regression suite for the three recipes repositories owns: "02-repositories", "03-repositories-arrow", and "12-all-projects" — same capture pipeline/recipes source as tests/visual/identical.spec.ts, split out so each context captures its own recipes exactly once.
//
// Goldens resolve via this project's own `snapshotPathTemplate` — see
// playwright.config.ts's `common-visual` project comment for why
// `{projectName}` can't be used here.
import { expect, test } from "@playwright/test";
import { extraRecipes, recipes } from "../../../../../common/tests/ui/support/recipes";
import { captureState } from "../../../../../common/tests/ui/support/pipeline.mjs";

const REPOSITORIES_OWNED_RECIPE_NAMES = new Set(["02-repositories", "03-repositories-arrow", "12-all-projects"]);
const keyRecipes = [...recipes, ...extraRecipes].filter((recipe) => REPOSITORIES_OWNED_RECIPE_NAMES.has(recipe.name));

test.describe("visual (repositories): implementation vs goldens", () => {
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

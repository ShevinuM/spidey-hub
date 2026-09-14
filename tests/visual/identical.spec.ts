import { expect, test } from "@playwright/test";
import { bootRecipes, cmdlineRecipes, extraRecipes, iteration3Recipes, notificationsRecipes, recipes } from "../../src/common/tests/ui/support/recipes.ts";
import { captureBootState, captureState } from "../../src/common/tests/ui/support/pipeline.mjs";

// Recipes owned by a feature's own visual suite are captured there instead,
// against that feature's own goldens/ tree, so each recipe is captured
// exactly once.
const SPLIT_OWNED_RECIPE_NAMES = new Set([
  "06-editor",
  "15-cmdline",
  "18-split",
  "19-choose-tree",
  "07-profile",
  "11-help",
  "20-help-search",
  "13-boot-mid",
  "14-boot-ready",
  "01-dashboard",
  "08-tracker",
  "21-notifications-panel-open",
  "04-employment-l0",
  "05-employment-l1",
  "02-repositories",
  "03-repositories-arrow",
  "12-all-projects",
  "09-grep-empty",
  "10-grep-query",
  "16-shell",
  "17-host-shell",
]);
const keyRecipes = [...recipes, ...extraRecipes, ...cmdlineRecipes, ...iteration3Recipes, ...notificationsRecipes].filter(
  (recipe) => !SPLIT_OWNED_RECIPE_NAMES.has(recipe.name),
);

// Visual-regression harness policy: start maxDiffPixels: 0; if
// antialiasing noise appears, relax to at most
// maxDiffPixelRatio: 0.0005 per shot with a comment justifying it, and the
// diff images must be eyeballed.
const RATIO_RELAXED = new Set<string>([]);

test.describe("visual: implementation vs goldens", () => {
  test.beforeEach(async ({ page }) => {
    // The commit-refresh island fires a fetch on Repositories mount, and
    // fixture repos must not depend on api.github.com 404-ing by luck.
    await page.route("**/api.github.com/**", (route) => route.abort());
  });

  for (const recipe of keyRecipes) {
    test(recipe.name, async ({ page, baseURL }) => {
      const png = await captureState(page, baseURL ?? "http://localhost:4322", recipe);
      expect(png).toMatchSnapshot({
        name: `${recipe.name}.png`,
        ...(RATIO_RELAXED.has(recipe.name) ? { maxDiffPixelRatio: 0.0005 } : { maxDiffPixels: 0 }),
      });
    });
  }
});

// Boot-sequence goldens are captured via captureBootState() (pipeline.mjs)
// rather than captureState() — see that function's header comment for the
// clock-control hazards specific to a still-running, elapsed-time-driven
// overlay the other recipes never hit.
test.describe("visual: boot sequence vs goldens", () => {
  for (const bootRecipe of bootRecipes.filter((recipe) => !SPLIT_OWNED_RECIPE_NAMES.has(recipe.name))) {
    test(bootRecipe.name, async ({ page, baseURL }) => {
      const png = await captureBootState(page, baseURL ?? "http://localhost:4322", bootRecipe);
      expect(png).toMatchSnapshot({
        name: `${bootRecipe.name}.png`,
        ...(RATIO_RELAXED.has(bootRecipe.name) ? { maxDiffPixelRatio: 0.0005 } : { maxDiffPixels: 0 }),
      });
    });
  }
});

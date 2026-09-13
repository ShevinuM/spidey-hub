// Pixel-regression suite for the 2 recipes GrepOverlay.svelte owns
// ("09-grep-empty", "10-grep-query"); see tests/visual/identical.spec.ts's
// own header for the shared capture pipeline this reuses verbatim.

// Goldens resolve via this project's own `snapshotPathTemplate` to
// src/features/grep/tests/ui/visual/goldens/<viewport>/<recipe>.png,
// hardcoded rather than derived from `{projectName}` since the project
// name carries a "grep-visual-" prefix the literal directory name must not.
import { expect, test } from "@playwright/test";
import { recipes } from "../../../../../common/tests/ui/support/recipes";
import { captureState } from "../../../../../common/tests/ui/support/pipeline.mjs";

const GREP_OWNED_RECIPE_NAMES = new Set(["09-grep-empty", "10-grep-query"]);
const keyRecipes = recipes.filter((recipe) => GREP_OWNED_RECIPE_NAMES.has(recipe.name));

test.describe("visual (grep): implementation vs goldens", () => {
  test.beforeEach(async ({ page }) => {
    // Same network-determinism rule as tests/visual/identical.spec.ts /
    // src/common/tests/ui/support/capture-goldens.mjs: the commit-refresh
    // island fires a fetch on Repositories mount, and fixture repos must
    // not depend on api.github.com 404-ing by luck.
    await page.route("**/api.github.com/**", (route) => route.abort());
  });

  for (const recipe of keyRecipes) {
    test(recipe.name, async ({ page, baseURL }) => {
      const png = await captureState(page, baseURL ?? "http://localhost:4322", recipe);
      expect(png).toMatchSnapshot({ name: `${recipe.name}.png`, maxDiffPixels: 0 });
    });
  }
});

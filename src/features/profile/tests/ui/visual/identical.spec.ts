// Pixel-regression suite for the one recipe Profile.svelte owns
// ("07-profile").
//
// Reuses tests/visual/identical.spec.ts's capture pipeline verbatim — see
// its header for the full mechanism.
//
// Goldens resolve via this project's
// own `snapshotPathTemplate` — see playwright.config.ts's `common-visual`
// project comment for why `{projectName}` can't be used here.
import { expect, test } from "@playwright/test";
import { recipes } from "../../../../../common/tests/ui/support/recipes";
import { captureState } from "../../../../../common/tests/ui/support/pipeline.mjs";

const PROFILE_OWNED_RECIPE_NAMES = new Set(["07-profile"]);
const keyRecipes = recipes.filter((recipe) => PROFILE_OWNED_RECIPE_NAMES.has(recipe.name));

test.describe("visual (profile): implementation vs goldens", () => {
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

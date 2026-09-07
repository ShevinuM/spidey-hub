// Pixel-regression suite for the recipe phase 03 (profile) owns per
// Instructions/01-pre-phase/recipe-feature-map.md's "owning phase" column:
// "07-profile" (Profile.svelte). Split out of tests/visual/identical.spec.ts
// (00-phases.md D21) the same way phase 02 split its 4 common-owned
// recipes out — every recipe is captured exactly once as later phases do
// the same for their own owned recipes. Same capture pipeline
// (common/tests/ui/support/pipeline.mjs), same recipes source
// (common/tests/ui/support/recipes.ts), same real-implementation build
// (port 4322) — see tests/visual/identical.spec.ts's own header comment for
// the full mechanism this reuses verbatim.
//
// Goldens resolve via this project's own `snapshotPathTemplate`
// (playwright.config.ts, "profile-visual-<viewport>" projects) to
// src/features/profile/tests/ui/visual/goldens/<viewport>/<recipe>.png —
// hardcoded per project rather than derived from `{projectName}`, since the
// project name now carries a "profile-visual-" context prefix that the
// viewport-only literal directory name must not (D21(a)). Feature tests
// nest under src/features/<f>/tests/ (unlike common's top-level
// common/tests/), per D21(a)'s own recorded convention.
import { expect, test } from "@playwright/test";
import { recipes } from "../../../../../../common/tests/ui/support/recipes";
import { captureState } from "../../../../../../common/tests/ui/support/pipeline.mjs";

const PROFILE_OWNED_RECIPE_NAMES = new Set(["07-profile"]);
const keyRecipes = recipes.filter((recipe) => PROFILE_OWNED_RECIPE_NAMES.has(recipe.name));

test.describe("visual (profile): implementation vs goldens", () => {
  test.beforeEach(async ({ page }) => {
    // Same network-determinism rule as tests/visual/identical.spec.ts /
    // tests/visual/capture-goldens.mjs: the commit-refresh island fires a
    // fetch on Repositories mount, and fixture repos must not depend on
    // api.github.com 404-ing by luck.
    await page.route("**/api.github.com/**", (route) => route.abort());
  });

  for (const recipe of keyRecipes) {
    test(recipe.name, async ({ page, baseURL }) => {
      const png = await captureState(page, baseURL ?? "http://localhost:4322", recipe);
      expect(png).toMatchSnapshot({ name: `${recipe.name}.png`, maxDiffPixels: 0 });
    });
  }
});

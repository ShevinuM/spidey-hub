// Pixel-regression suite for the one recipe Profile.svelte owns
// ("07-profile"). Split out of tests/visual/identical.spec.ts the same way
// the common-owned recipes were split into common/tests/ui/visual/ — every
// recipe is captured exactly once, never twice and never dropped, as each
// context/feature owns its own rendered recipes. Same capture pipeline
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
// viewport-only literal directory name must not. Feature tests nest under
// src/features/<f>/tests/ (unlike common's top-level common/tests/).
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

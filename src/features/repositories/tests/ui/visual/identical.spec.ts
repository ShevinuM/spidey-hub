// Pixel-regression suite for the three recipes repositories owns:
// "02-repositories" and "03-repositories-arrow" (both live in `recipes`) and
// "12-all-projects" (lives in `extraRecipes` — the virtual all-projects repo
// is the FIRST row in the repo list, distinct from "02-repositories"'s
// highlighted-row state). Split out of tests/visual/identical.spec.ts the
// same way common's, profile's and help's own recipes were split — every
// recipe is captured exactly once, never twice and never dropped, as each
// context/feature owns its own rendered recipes. Same capture pipeline
// (src/common/tests/ui/support/pipeline.mjs), same recipes source
// (src/common/tests/ui/support/recipes.ts), same real-implementation build
// (port 4322) — see tests/visual/identical.spec.ts's own header comment for
// the full mechanism this reuses verbatim.
//
// Goldens resolve via this project's own `snapshotPathTemplate`
// (playwright.config.ts, "repositories-visual-<viewport>" projects) to
// src/features/repositories/tests/ui/visual/goldens/<viewport>/<recipe>.png —
// hardcoded per project rather than derived from `{projectName}`, since the
// project name now carries a "repositories-visual-" context prefix that the
// viewport-only literal directory name must not. Feature tests nest under
// src/features/<f>/tests/ (unlike common's src/common/tests/).
import { expect, test } from "@playwright/test";
import { extraRecipes, recipes } from "../../../../../common/tests/ui/support/recipes";
import { captureState } from "../../../../../common/tests/ui/support/pipeline.mjs";

const REPOSITORIES_OWNED_RECIPE_NAMES = new Set(["02-repositories", "03-repositories-arrow", "12-all-projects"]);
const keyRecipes = [...recipes, ...extraRecipes].filter((recipe) => REPOSITORIES_OWNED_RECIPE_NAMES.has(recipe.name));

test.describe("visual (repositories): implementation vs goldens", () => {
  test.beforeEach(async ({ page }) => {
    // Same network-determinism rule as tests/visual/identical.spec.ts /
    // src/common/tests/ui/support/capture-goldens.mjs: the commit-refresh island fires a
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

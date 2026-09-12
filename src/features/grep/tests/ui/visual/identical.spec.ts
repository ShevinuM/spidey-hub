// Pixel-regression suite for the 2 recipes GrepOverlay.svelte owns
// ("09-grep-empty", "10-grep-query"). Split out of
// tests/visual/identical.spec.ts the same way the common-owned/
// profile-owned/help-owned/boot-owned/notifications-owned/dashboard-owned/
// employment-owned/repositories-owned recipes were split into their own
// contexts — every recipe is captured exactly once, never twice and never
// dropped, as each context/feature owns its own rendered recipes. Same
// capture pipeline (common/tests/ui/support/pipeline.mjs), same recipes
// source (common/tests/ui/support/recipes.ts), same real-implementation
// build (port 4322) — see tests/visual/identical.spec.ts's own header
// comment for the full mechanism this reuses verbatim.
//
// Goldens resolve via this project's own `snapshotPathTemplate`
// (playwright.config.ts, "grep-visual-<viewport>" projects) to
// src/features/grep/tests/ui/visual/goldens/<viewport>/<recipe>.png —
// hardcoded per project rather than derived from `{projectName}`, since the
// project name now carries a "grep-visual-" context prefix that the
// viewport-only literal directory name must not. Feature tests nest under
// src/features/<f>/tests/ (unlike common's top-level common/tests/).
import { expect, test } from "@playwright/test";
import { recipes } from "../../../../../../common/tests/ui/support/recipes";
import { captureState } from "../../../../../../common/tests/ui/support/pipeline.mjs";

const GREP_OWNED_RECIPE_NAMES = new Set(["09-grep-empty", "10-grep-query"]);
const keyRecipes = recipes.filter((recipe) => GREP_OWNED_RECIPE_NAMES.has(recipe.name));

test.describe("visual (grep): implementation vs goldens", () => {
  test.beforeEach(async ({ page }) => {
    // Same network-determinism rule as tests/visual/identical.spec.ts /
    // common/tests/ui/support/capture-goldens.mjs: the commit-refresh
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

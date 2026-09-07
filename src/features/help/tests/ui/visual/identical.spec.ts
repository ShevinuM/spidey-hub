// Pixel-regression suite for the two recipes help owns: "11-help" (lives in
// recipes.ts's `extraRecipes` array — the dashboard has no bare-key Help
// shortcut, reached with `Ctrl-b 5`) and "20-help-search" (lives in
// `iteration3Recipes` — bare `?` opens the site-wide HelpSearch palette,
// then types the "kil" fuzzy canary). Split out of
// tests/visual/identical.spec.ts the same way common's and profile's own
// recipes were split — every recipe is captured exactly once, never twice
// and never dropped, as each context/feature owns its own rendered recipes.
// Same capture pipeline (common/tests/ui/support/pipeline.mjs), same
// recipes source (common/tests/ui/support/recipes.ts), same
// real-implementation build (port 4322) — see tests/visual/identical.spec.ts's
// own header comment for the full mechanism this reuses verbatim.
//
// Goldens resolve via this project's own `snapshotPathTemplate`
// (playwright.config.ts, "help-visual-<viewport>" projects) to
// src/features/help/tests/ui/visual/goldens/<viewport>/<recipe>.png —
// hardcoded per project rather than derived from `{projectName}`, since the
// project name now carries a "help-visual-" context prefix that the
// viewport-only literal directory name must not. Feature tests nest under
// src/features/<f>/tests/ (unlike common's top-level common/tests/).
import { expect, test } from "@playwright/test";
import { extraRecipes, iteration3Recipes } from "../../../../../../common/tests/ui/support/recipes";
import { captureState } from "../../../../../../common/tests/ui/support/pipeline.mjs";

const HELP_OWNED_RECIPE_NAMES = new Set(["11-help", "20-help-search"]);
const keyRecipes = [...extraRecipes, ...iteration3Recipes].filter((recipe) => HELP_OWNED_RECIPE_NAMES.has(recipe.name));

test.describe("visual (help): implementation vs goldens", () => {
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

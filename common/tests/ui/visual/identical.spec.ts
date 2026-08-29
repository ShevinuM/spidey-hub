// Pixel-regression suite for the recipes phase 02 (common) owns per
// Instructions/01-pre-phase/recipe-feature-map.md's "owning phase" column:
// "06-editor" (the shared vim editor, D9), "15-cmdline" (the floating
// command box, D10 kernel chrome), "18-split" (pane-tree layout cycling —
// tmux engine + PaneTree.svelte, D10), and "19-choose-tree" (ChooseTree,
// D10). Split out of tests/visual/identical.spec.ts (00-phases.md D21) so
// every recipe is captured exactly once as later phases do the same for
// their own owned recipes. Same capture pipeline
// (common/tests/ui/support/pipeline.mjs), same recipes source
// (common/tests/ui/support/recipes.ts), same real-implementation build
// (port 4322) — see tests/visual/identical.spec.ts's own header comment for
// the full mechanism this reuses verbatim.
//
// Goldens resolve via this project's own `snapshotPathTemplate`
// (playwright.config.ts, "common-visual-<viewport>" projects) to
// common/tests/ui/visual/goldens/<viewport>/<recipe>.png — hardcoded per
// project rather than derived from `{projectName}`, since the project name
// now carries a "common-visual-" context prefix that the viewport-only
// literal directory name must not (D21(a)).
import { expect, test } from "@playwright/test";
import { cmdlineRecipes, iteration3Recipes, recipes } from "../support/recipes.ts";
import { captureState } from "../support/pipeline.mjs";

const COMMON_OWNED_RECIPE_NAMES = new Set(["06-editor", "15-cmdline", "18-split", "19-choose-tree"]);
const keyRecipes = [...recipes, ...cmdlineRecipes, ...iteration3Recipes].filter((recipe) =>
  COMMON_OWNED_RECIPE_NAMES.has(recipe.name),
);

test.describe("visual (common): implementation vs goldens", () => {
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

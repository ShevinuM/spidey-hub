// Pixel-regression suite: replays the shared recipes (tests/visual/recipes.ts)
// against the real implementation (built with PORTFOLIO_FIXTURES=1, served by
// the `pnpm exec astro preview --port 4322` webServer entry in
// playwright.config.ts) using the exact same capture pipeline
// (tests/visual/pipeline.mjs) used to produce tests/visual/goldens/, so the
// two sides can never structurally drift apart.
//
// Phase 3 wired "01-dashboard" (dashboard/wallpaper/status bar/toasts).
// Phase 4 adds "08-tracker" (tracker view chrome: full-opacity wallpaper +
// back pill). Later phases add their own recipe name to RECIPE_NAMES as
// their views land; the recipes list itself (tests/visual/recipes.ts)
// already has all 10 entries so no renumbering is needed later.
import { expect, test } from "@playwright/test";
import { recipes } from "./recipes.ts";
import { captureState } from "./pipeline.mjs";

// Recipes wired up so far. Append to this list, in order, as later phases
// complete their views — do not reorder tests/visual/recipes.ts itself.
const RECIPE_NAMES = ["01-dashboard", "08-tracker"];

const activeRecipes = recipes.filter((r) => RECIPE_NAMES.includes(r.name));

test.describe("visual: implementation vs goldens", () => {
  test.beforeEach(async ({ page }) => {
    // Same network-determinism rule as tests/visual/capture-goldens.mjs
    // (PLAN.md "Network determinism"): the commit-refresh island fires a
    // fetch on Builds mount, and fixture repos must not depend on
    // api.github.com 404-ing by luck.
    await page.route("**/api.github.com/**", (route) => route.abort());
  });

  for (const recipe of activeRecipes) {
    test(recipe.name, async ({ page, baseURL }) => {
      const png = await captureState(page, baseURL ?? "http://localhost:4322", recipe);
      expect(png).toMatchSnapshot({
        name: `${recipe.name}.png`,
        maxDiffPixels: 0,
      });
    });
  }
});

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
const RECIPE_NAMES = ["01-dashboard", "02-builds", "03-builds-j", "08-tracker"];

const activeRecipes = recipes.filter((r) => RECIPE_NAMES.includes(r.name));

// PLAN.md "Visual-regression harness": "start maxDiffPixels: 0; if
// antialiasing noise appears, an executor may relax to at most
// maxDiffPixelRatio: 0.0005 per shot with a comment justifying it, and the
// verifier must eyeball the diff images."
//
// "02-builds"/"03-builds-j" (Phase 5) each have exactly 1 pixel of diff at
// both viewports, always at the same spot: the boundary between the "•"
// bullet glyph and the following space in panel [3]'s third repo row
// ("dotfiles main ↓4" — Homepage.dc.html's own sample data). The DOM/CSS at
// that exact spot is byte-identical to the prototype's markup
// (`<span>{mark}</span> {name}`); the differing pixels are a handful of
// dim, near-background antialiasing shades (e.g. rgb(84,94,103) vs
// rgb(32,39,45) — both within a few percent of the panel's own
// near-black background), consistent across repeated local captures, with
// no other pixel in either screenshot affected — i.e. Chromium
// text-rendering/hinting jitter at that specific sub-pixel glyph boundary,
// not a structural or content difference. 1 px is ~7e-7 of the
// 1512x945/1920x1080 frame, far under the 0.0005 ceiling.
const RATIO_RELAXED = new Set(["02-builds", "03-builds-j"]);

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
        ...(RATIO_RELAXED.has(recipe.name) ? { maxDiffPixelRatio: 0.0005 } : { maxDiffPixels: 0 }),
      });
    });
  }
});

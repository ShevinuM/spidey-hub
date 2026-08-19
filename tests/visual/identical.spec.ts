// Pixel-regression suite: replays the shared recipes (tests/visual/recipes.ts)
// against the real implementation (built with PORTFOLIO_FIXTURES=1, served by
// the `pnpm exec astro preview --port 4322` webServer entry in
// playwright.config.ts) using the exact same capture pipeline
// (tests/visual/pipeline.mjs) used to produce tests/visual/goldens/, so the
// two sides can never structurally drift apart.
//
// This suite wires in five recipe arrays from
// recipes.ts — 20 recipes total,
// 40 goldens across both viewports:
//   - `recipes` (10): the original set, re-baselined against our OWN
//     implementation (see recipes.ts's header comment for the
//     three action-list fixes this required — "03-builds-j"/"05-personnel-
//     l1"/"06-editor" — found by actually running them, not by inspection).
//   - `extraRecipes` (2): "11-help", "12-all-projects" — states the
//     vendored prototype never had. "11-help" was re-validated
//     (its action changed from `?` to `h` —
//     freeing `?` up for the HelpSearch palette, "20-help-search" below).
//   - `cmdlineRecipes` (1): "15-cmdline" — the floating command box
//     (its suggestion list was removed — same actions, new content).
//   - `bootRecipes` (2): "13-boot-mid"/"14-boot-ready" — captured through a
//     SEPARATE function (`captureBootState()`, not `captureState()`) because
//     they need a different, boot-specific clock-control sequence to be
//     deterministic — see that function's header comment in pipeline.mjs.
//   - `iteration3Recipes` (5): "16-shell"/"17-host-shell"/"18-split"/
//     "19-choose-tree"/"20-help-search" — states covering shell/
//     sessions/panes/layouts/choose-tree/HelpSearch; see
//     recipes.ts's own header comment on this array for the verified
//     keystroke sequences.
//
// This suite is now the goldens' SOLE authority: tests/visual/capture-goldens.mjs's
// vendored-prototype path is retired to historical/guarded status (see its
// own header comment) and is never run as part of normal development.
import { expect, test } from "@playwright/test";
import { bootRecipes, cmdlineRecipes, extraRecipes, iteration3Recipes, recipes } from "./recipes.ts";
import { captureBootState, captureState } from "./pipeline.mjs";

// The 18 standard (key/type replay) recipes, captured via captureState().
// bootRecipes are handled by their own describe block below via
// captureBootState() instead — a different capture function, not just a
// different recipe shape. `iteration3Recipes` (16-shell/17-host-shell/18-split/19-choose-tree/
// 20-help-search) to the union — 20 recipes total, 40 goldens across both
// viewports.
const keyRecipes = [...recipes, ...extraRecipes, ...cmdlineRecipes, ...iteration3Recipes];

// Visual-regression harness policy: start maxDiffPixels: 0; if
// antialiasing noise appears, relax to at most
// maxDiffPixelRatio: 0.0005 per shot with a comment justifying it, and the
// diff images must be eyeballed.
//
// The relaxations previously carried on
// "02-builds"/"03-builds-j"/"06-editor" existed to reconcile Chromium AA
// jitter between the vendored PROTOTYPE reference and our implementation —
// two visually near-identical but not byte-identical renderers. Now that
// the goldens are self-baselines (captured from, and compared against, this
// SAME implementation), that specific rationale is gone; every recipe here
// starts at `maxDiffPixels: 0` again. Any entry added back to the set below
// must cite fresh forensics from an actual three-run determinism check
// (which pixels, how many, why — e.g. the README-PIPELINE.md-documented GPU
// blur-rasterization jitter, which is capture-vs-capture and can in
// principle still surface here), not prototype-skew reasoning.
const RATIO_RELAXED = new Set<string>([]);

test.describe("visual: implementation vs goldens", () => {
  test.beforeEach(async ({ page }) => {
    // Same network-determinism rule as tests/visual/capture-goldens.mjs:
    // the commit-refresh island fires a
    // fetch on Builds mount, and fixture repos must not depend on
    // api.github.com 404-ing by luck.
    await page.route("**/api.github.com/**", (route) => route.abort());
  });

  for (const recipe of keyRecipes) {
    test(recipe.name, async ({ page, baseURL }) => {
      const png = await captureState(page, baseURL ?? "http://localhost:4322", recipe);
      expect(png).toMatchSnapshot({
        name: `${recipe.name}.png`,
        ...(RATIO_RELAXED.has(recipe.name) ? { maxDiffPixelRatio: 0.0005 } : { maxDiffPixels: 0 }),
      });
    });
  }
});

// Boot-sequence goldens, captured via
// captureBootState() (pipeline.mjs) rather than captureState() — see that
// function's header comment for the clock-control hazards specific to a
// still-running, elapsed-time-driven overlay that the other 13 recipes
// (all captured at a settled, boot-already-skipped view) never hit.
test.describe("visual: boot sequence vs goldens", () => {
  for (const bootRecipe of bootRecipes) {
    test(bootRecipe.name, async ({ page, baseURL }) => {
      const png = await captureBootState(page, baseURL ?? "http://localhost:4322", bootRecipe);
      expect(png).toMatchSnapshot({
        name: `${bootRecipe.name}.png`,
        ...(RATIO_RELAXED.has(bootRecipe.name) ? { maxDiffPixelRatio: 0.0005 } : { maxDiffPixels: 0 }),
      });
    });
  }
});

// Pixel-regression suite: replays the shared recipes (tests/visual/recipes.ts)
// against the real implementation (built with PORTFOLIO_FIXTURES=1, served by
// the `pnpm exec astro preview --port 4322` webServer entry in
// playwright.config.ts) using the exact same capture pipeline
// (tests/visual/pipeline.mjs) used to produce tests/visual/goldens/, so the
// two sides can never structurally drift apart.
//
// Phase 3 wired "01-dashboard" (dashboard/wallpaper/status bar/toasts).
// Phase 4 adds "08-tracker" (tracker view chrome: full-opacity wallpaper +
// back pill). Phase 6 adds "04-personnel-l0"/"05-personnel-l1" (the yazi
// file-browser pane at both levels) and "06-editor" (the first pixel test
// of Editor.svelte itself — Phase 5's 02/03 never opened it). Later phases
// add their own recipe name to RECIPE_NAMES as their views land; the
// recipes list itself (tests/visual/recipes.ts) already has all 10 entries
// so no renumbering is needed later.
import { expect, test } from "@playwright/test";
import { recipes } from "./recipes.ts";
import { captureState } from "./pipeline.mjs";

// Recipes wired up so far. Append to this list, in order, as later phases
// complete their views — do not reorder tests/visual/recipes.ts itself.
const RECIPE_NAMES = [
  "01-dashboard",
  "02-builds",
  "03-builds-j",
  "04-personnel-l0",
  "05-personnel-l1",
  "06-editor",
  "07-profile",
  "08-tracker",
];

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
// "06-editor" (Phase 6) is the first capture to actually open Editor.svelte
// (02-builds/03-builds-j never open a file). At both viewports pixelmatch
// counts exactly 6 diff pixels, all at ONE glyph boundary — the file tab's
// "▤" icon (top-right) — at the same right-edge column offset in both
// viewports: x=1238, y=18-23 at 1512x945; x=1646, y=18-23 at 1920x1080 (a
// vertical run of 6px on one edge column of the glyph). The breadcrumb text
// ("Enaimco › software-developer-full-time.md") is never flagged by
// pixelmatch at either viewport. Expected (golden) pixels at that column are
// near-black background tones (e.g. rgb(30,19,23) through rgb(39,22,25));
// actual (impl) pixels are a uniform rgb(152,51,46) — a lighter red
// antialiasing shade one step further into the glyph's edge falloff, with 8
// immediately adjacent pixels classified as anti-aliasing by pixelmatch and
// excluded from the count. This is single-glyph AA jitter at one sub-pixel
// boundary, not a structural or content difference, consistent with the
// Chromium text-rendering/hinting jitter already documented for
// 02-builds/03-builds-j above. 6px is ~4.2e-6 of the 1512x945/1920x1080
// frame, far under the 0.0005 ceiling.
const RATIO_RELAXED = new Set(["02-builds", "03-builds-j", "06-editor"]);

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

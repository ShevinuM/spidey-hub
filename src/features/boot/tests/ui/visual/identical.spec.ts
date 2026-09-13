// Pixel-regression suite for the two recipes boot owns: "13-boot-mid" and
// "14-boot-ready" (both live in `src/common/tests/ui/support/recipes.ts`'s
// `bootRecipes` array — a separate `BootRecipe` shape, `{ name,
// clockOffsetMs }`, with no `actions`/`check` fields, unlike every other
// recipe). Split out of tests/visual/identical.spec.ts the same way
// common's/profile's/help's own recipes were split — every recipe is
// captured exactly once, never twice and never dropped, as each
// context/feature owns its own rendered recipes.
//
// Captured via a SEPARATE function, `captureBootState()` (not
// `captureState()`): boot's `pct`/phase/log/handshake math reads exact
// elapsed milliseconds, so the capture needs `page.clock.install()` +
// `pauseAt()` BEFORE `page.goto()` (not the ordinary
// install-then-`runFor`-after-navigation sequence), a two-stage `pauseAt`
// for offsets past the hard-stop, no key/type actions to replay, and
// deliberately no boot-seen sessionStorage pre-seed (the opposite of
// `captureState()` — a boot golden's entire point is a genuine, unskipped
// boot). See `captureBootState()`'s own header comment in pipeline.mjs for
// the full mechanism.
//
// Goldens resolve via this project's own `snapshotPathTemplate`
// (playwright.config.ts, "boot-visual-<viewport>" projects) to
// src/features/boot/tests/ui/visual/goldens/<viewport>/<recipe>.png —
// hardcoded per project rather than derived from `{projectName}`, same
// reasoning as common's/profile's/help's own split projects.
import { expect, test } from "@playwright/test";
import { bootRecipes } from "../../../../../common/tests/ui/support/recipes";
import { captureBootState } from "../../../../../common/tests/ui/support/pipeline.mjs";

const BOOT_OWNED_RECIPE_NAMES = new Set(["13-boot-mid", "14-boot-ready"]);
const keyRecipes = bootRecipes.filter((recipe) => BOOT_OWNED_RECIPE_NAMES.has(recipe.name));

test.describe("visual (boot): boot sequence vs goldens", () => {
  for (const bootRecipe of keyRecipes) {
    test(bootRecipe.name, async ({ page, baseURL }) => {
      const png = await captureBootState(page, baseURL ?? "http://localhost:4322", bootRecipe);
      expect(png).toMatchSnapshot({ name: `${bootRecipe.name}.png`, maxDiffPixels: 0 });
    });
  }
});

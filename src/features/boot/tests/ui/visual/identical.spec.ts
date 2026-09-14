// Pixel-regression suite for the two recipes boot owns: "13-boot-mid" and
// "14-boot-ready" (in recipes.ts's `bootRecipes` array, a separate
// `BootRecipe` shape with no `actions`/`check` fields).
//
// Captured via `captureBootState()`, not `captureState()`: boot's
// pct/phase/log/handshake math reads exact elapsed milliseconds, which
// needs the two-stage `pauseAt()` mechanism BootPage.ts owns, and no
// boot-seen sessionStorage pre-seed (a boot golden's entire point is a
// genuine, unskipped boot).
//
// Goldens resolve via this project's own `snapshotPathTemplate` — see
// playwright.config.ts's `common-visual` project comment for why
// `{projectName}` can't be used here.
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

// Goldens resolve via this project's own `snapshotPathTemplate` — see
// playwright.config.ts's `common-visual` project comment for why
// `{projectName}` can't be used here.
import { expect, test } from "@playwright/test";
import { notificationsRecipes } from "../../../../../common/tests/ui/support/recipes";
import { captureState } from "../../../../../common/tests/ui/support/pipeline.mjs";

const NOTIFICATIONS_OWNED_RECIPE_NAMES = new Set(["21-notifications-panel-open"]);
const keyRecipes = notificationsRecipes.filter((recipe) =>
  NOTIFICATIONS_OWNED_RECIPE_NAMES.has(recipe.name),
);

test.describe("visual (notifications): signal-inbox panel vs goldens", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api.github.com/**", (route) => route.abort());
  });

  for (const recipe of keyRecipes) {
    test(recipe.name, async ({ page, baseURL }) => {
      const png = await captureState(page, baseURL ?? "http://localhost:4322", recipe);
      expect(png).toMatchSnapshot({ name: `${recipe.name}.png`, maxDiffPixels: 0 });
    });
  }
});

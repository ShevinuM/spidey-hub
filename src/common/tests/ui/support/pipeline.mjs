// Shared capture pipeline for goldens and the real implementation —
// capture-goldens.mjs and identical.spec.ts both call `captureState()` below
// so the two sides can never drift apart.
//
// `captureBootState()`, further down, is a separate function for the two
// boot recipes only, which need a different clock-control sequence (see its
// own doc comment).
//
// Order of operations (see README-PIPELINE.md for the full rationale):
// install the fake clock before navigating, wait for the dashboard mount
// marker, replay the recipe's actions, then `clock.runFor(RUN_FOR_MS)` twice
// — once before the wait, to flush the first render, and once after, to
// flush whatever the recipe's actions started — before screenshotting.
import { BOOT_HARD_STOP_MS, CLOCK_TIME, RUN_FOR_MS, TOAST_SEED } from "./recipes.ts";
import { BOOT_SEEN_STORAGE_KEY } from "../../../../features/boot/lib/boot-state.ts";
import { TOAST_SEED_STORAGE_KEY } from "../../../../features/notifications/lib/toast-seed.ts";

/**
 * CSS selector for the SIGNAL footer's net-readout span (Profile view).
 *
 * Note the space after the colon: the browser re-serializes inline `style`
 * attributes (e.g. "font-variant-numeric:tabular-nums" in the source
 * becomes "font-variant-numeric: tabular-nums" in the live DOM), so the
 * substring match must target the normalized form, not the HTML source.
 *
 * Structural canary only, not a mask target (see SIGNAL_ROW_SELECTOR) — a
 * regression here fails the capture loudly rather than masking nothing.
 */
export const NET_READOUT_SELECTOR =
  'span[style*="font-variant-numeric: tabular-nums"]';
/**
 * CSS selector for the 60-bar SIGNAL meter container (Profile view).
 *
 * Structural canary only, not a mask target — same reasoning as
 * NET_READOUT_SELECTOR.
 */
export const METER_BARS_SELECTOR =
  'div[style*="align-items: flex-end"][style*="overflow: hidden"]';
/**
 * CSS selector for the SIGNAL footer row (Profile view) — the mask target,
 * since its box is fixed by static CSS while the net-readout/meter-bars
 * content inside it varies with real load timing (see README-PIPELINE.md).
 */
export const SIGNAL_ROW_SELECTOR =
  'div[style*="border-top: 1px solid rgba(224, 69, 60, 0.25)"]';

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {import('./recipes.ts').Recipe} recipe
 * @returns {Promise<Buffer>} PNG bytes
 */
export async function captureState(page, url, recipe) {
  // Pre-seeds the boot-skip flag (every recipe here wants the READY
  // dashboard/view state; `captureBootState()` below deliberately skips this
  // pre-seed for the two `bootRecipes` it captures instead) and the
  // toast-seed key, both before navigation, via the same best-effort
  // addInitScript contract as fixtures.ts's combined context.addInitScript.
  await page.addInitScript(
    ({ bootKey, toastSeedKey, toastSeed }) => {
      try {
        sessionStorage.setItem(bootKey, "1");
        sessionStorage.setItem(toastSeedKey, String(toastSeed));
      } catch {
        // ignore — same best-effort contract as src/features/boot/lib/boot-state.ts
      }
    },
    { bootKey: BOOT_SEEN_STORAGE_KEY, toastSeedKey: TOAST_SEED_STORAGE_KEY, toastSeed: TOAST_SEED },
  );

  await page.clock.install({ time: CLOCK_TIME });
  await page.goto(url, { waitUntil: "load" });
  await page.clock.runFor(RUN_FOR_MS);

  // `.or()` matches whichever mount marker exists: the real implementation's
  // wordmark testid, or the frozen vendored prototype's literal plate text
  // (see capture-goldens.mjs) — so this one wait works for both callers.
  const dashboardMountMarker = page
    .getByText("SHEVINUM.DEV")
    .or(page.locator('[data-testid="dashboard-wordmark"]'));
  await dashboardMountMarker.first().waitFor({ state: "visible", timeout: 15000 });

  for (const action of recipe.actions) {
    if ("key" in action) {
      await page.keyboard.press(action.key);
    } else {
      await page.keyboard.type(action.type);
    }
  }

  await page.clock.runFor(RUN_FOR_MS);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");

  if (recipe.check) {
    if (recipe.check.url) {
      const actual = new URL(page.url()).pathname;
      if (!recipe.check.url.test(actual)) {
        throw new Error(
          `recipe "${recipe.name}" expected URL matching ${recipe.check.url} but got "${actual}"`,
        );
      }
    }
    if (recipe.check.visible) {
      const locator = page.locator(recipe.check.visible).first();
      const visible = await locator.isVisible().catch(() => false);
      if (!visible) {
        throw new Error(
          `recipe "${recipe.name}" expected element matching "${recipe.check.visible}" to be visible, but it was not found/visible`,
        );
      }
    }
  }

  const isProfile = recipe.name === "07-profile";
  const readout = page.locator(NET_READOUT_SELECTOR);
  const meterBars = page.locator(METER_BARS_SELECTOR);
  const signalRow = page.locator(SIGNAL_ROW_SELECTOR);
  if (isProfile) {
    // Fail loudly rather than silently mask nothing or the wrong box (see
    // SIGNAL_ROW_SELECTOR).
    const readoutCount = await readout.count();
    const meterCount = await meterBars.count();
    const rowCount = await signalRow.count();
    if (readoutCount !== 1 || meterCount !== 1 || rowCount !== 1) {
      throw new Error(
        `07-profile mask selectors matched readout=${readoutCount} meterBars=${meterCount} signalRow=${rowCount}, expected 1 each`,
      );
    }
  }

  const mask = [signalRow];

  return page.screenshot({
    animations: "disabled",
    caret: "hide",
    mask,
  });
}

/**
 * Boot-sequence golden capture (recipes.ts's `bootRecipes`) — separate from
 * `captureState()` because boot needs its own clock-control sequence:
 * `page.clock.pauseAt()` must run immediately after `install()` and before
 * `goto()` to pin `Date.now()`, and a `clockOffsetMs` past
 * `BOOT_HARD_STOP_MS` needs two sequential `pauseAt` calls so the outro's
 * nested timeout is scheduled before it's fired (see README-PIPELINE.md for
 * the full empirical basis).
 *
 * No boot-seen sessionStorage pre-seed here,
 * unlike `captureState()` — a boot golden's whole point is a genuine,
 * unskipped boot.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {import('./recipes.ts').BootRecipe} bootRecipe
 * @returns {Promise<Buffer>} PNG bytes
 */
export async function captureBootState(page, url, bootRecipe) {
  await page.route("**/api.github.com/**", (route) => route.abort());

  // "14-boot-ready" reaches the post-outro dashboard with Toasts mounted, so
  // it needs the same toast-seed pin as captureState().
  await page.addInitScript(
    ({ toastSeedKey, toastSeed }) => {
      try {
        sessionStorage.setItem(toastSeedKey, String(toastSeed));
      } catch {
        // ignore — same best-effort contract as src/features/boot/lib/boot-state.ts
      }
    },
    { toastSeedKey: TOAST_SEED_STORAGE_KEY, toastSeed: TOAST_SEED },
  );

  await page.clock.install({ time: CLOCK_TIME });
  const t0 = new Date(CLOCK_TIME).getTime();
  await page.clock.pauseAt(t0);

  await page.goto(url, { waitUntil: "load" });
  await page
    .locator('[data-testid="boot-sequence"][data-boot-running="true"]')
    .waitFor({ state: "attached", timeout: 15000 });

  if (bootRecipe.clockOffsetMs > BOOT_HARD_STOP_MS) {
    // Stage through the hard-stop first so the outro's setTimeout is
    // scheduled before the final jump (see this function's doc comment).
    await page.clock.pauseAt(t0 + BOOT_HARD_STOP_MS + 10);
  }
  await page.clock.pauseAt(t0 + bootRecipe.clockOffsetMs);

  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");

  return page.screenshot({
    animations: "disabled",
    caret: "hide",
  });
}

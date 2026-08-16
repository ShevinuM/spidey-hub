// Shared capture pipeline (PLAN.md "Capture pipeline (identical for
// goldens and impl)"). Both tests/visual/capture-goldens.mjs (Phase 1,
// captures from the vendored prototype reference) and, from Phase 3,
// tests/visual/identical.spec.ts (captures from the real Astro build) call
// `captureState()` below so the two sides can never drift apart.
//
// Order of operations, and why (see tests/visual/README-PIPELINE.md for the
// long version):
//   1. page.clock.install() BEFORE navigation.
//   2. goto + wait for the "load" event.
//   3. clock.runFor(RUN_FOR_MS) — flushes whatever rAF/timers drive the
//      very first render. Under a fully faked clock, nothing beyond the
//      initial synchronous render happens until time is advanced, so this
//      must run BEFORE we wait for any post-mount selector or dispatch any
//      key — otherwise step 4 can hang (nothing ever mounts) or a keydown
//      can be dispatched before the listener that will handle it exists.
//   4. Wait for a dashboard-only marker (the SHEVINUM.DEV plate) to prove
//      the app mounted and its keydown listener is attached. Every recipe
//      starts from a fresh load of the home/dashboard view, so this marker
//      is always the right thing to wait for regardless of which recipe
//      runs next.
//   5. Replay the recipe's key/type actions.
//   6. clock.runFor(RUN_FOR_MS) again — flushes the rAF loop(s) belonging
//      to whatever view the recipe just switched to (tracker sweep,
//      SIGNAL meter, grep overlay mount, etc.), which only started ticking
//      after step 5's state change.
//   7. Wait for document.fonts.ready, then Playwright's "networkidle" load
//      state (reachable even under a faked clock: the meter's probe
//      Image() and any commit-refresh fetch only fire during runFor
//      windows, not in real time).
//   8. page.screenshot({ animations: "disabled", caret: "hide", mask }).
//
// Total fake-clock advance is 2 * RUN_FOR_MS (10s with the default from
// recipes.ts) — comfortably under 60s, so the displayed minute stays
// "23:34" throughout, matching the prototype's hardcoded text and (from
// Phase 3) the implementation's live clock at this same fixed instant.
import { CLOCK_TIME, RUN_FOR_MS } from "./recipes.ts";

/**
 * CSS selector for the SIGNAL footer's net-readout span (Profile view).
 * Note the space after the colon: the browser re-serializes inline `style`
 * attributes (e.g. "font-variant-numeric:tabular-nums" in the source
 * becomes "font-variant-numeric: tabular-nums" in the live DOM), so the
 * substring match must target the normalized form, not the HTML source.
 */
export const NET_READOUT_SELECTOR =
  'span[style*="font-variant-numeric: tabular-nums"]';
/** CSS selector for the 60-bar SIGNAL meter container (Profile view). */
export const METER_BARS_SELECTOR =
  'div[style*="align-items: flex-end"][style*="overflow: hidden"]';

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {import('./recipes.ts').Recipe} recipe
 * @returns {Promise<Buffer>} PNG bytes
 */
export async function captureState(page, url, recipe) {
  await page.clock.install({ time: CLOCK_TIME });
  await page.goto(url, { waitUntil: "load" });
  await page.clock.runFor(RUN_FOR_MS);

  await page.getByText("SHEVINUM.DEV").waitFor({ state: "visible", timeout: 15000 });

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

  const isProfile = recipe.name === "07-profile";
  const readout = page.locator(NET_READOUT_SELECTOR);
  const meterBars = page.locator(METER_BARS_SELECTOR);
  if (isProfile) {
    // Fail loudly if these selectors stop matching instead of silently
    // masking nothing (PLAN.md: net-readout + meter-strip masks are
    // pre-authorized because the meter measures real load timing even
    // under a faked Date).
    const readoutCount = await readout.count();
    const meterCount = await meterBars.count();
    if (readoutCount !== 1 || meterCount !== 1) {
      throw new Error(
        `07-profile mask selectors matched readout=${readoutCount} meterBars=${meterCount}, expected 1 each`,
      );
    }
  }

  return page.screenshot({
    animations: "disabled",
    caret: "hide",
    mask: [readout, meterBars],
  });
}

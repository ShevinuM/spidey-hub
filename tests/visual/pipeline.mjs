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
import { BOOT_SEEN_STORAGE_KEY } from "../../src/lib/bootState.ts";

/**
 * CSS selector for the SIGNAL footer's net-readout span (Profile view).
 * Note the space after the colon: the browser re-serializes inline `style`
 * attributes (e.g. "font-variant-numeric:tabular-nums" in the source
 * becomes "font-variant-numeric: tabular-nums" in the live DOM), so the
 * substring match must target the normalized form, not the HTML source.
 *
 * No longer used as a mask target (see SIGNAL_ROW_SELECTOR below) — kept
 * only as a structural canary so a selector regression fails the capture
 * loudly instead of silently masking nothing.
 */
export const NET_READOUT_SELECTOR =
  'span[style*="font-variant-numeric: tabular-nums"]';
/**
 * CSS selector for the 60-bar SIGNAL meter container (Profile view).
 * No longer used as a mask target (see SIGNAL_ROW_SELECTOR below) — kept
 * only as a structural canary, same reasoning as NET_READOUT_SELECTOR.
 */
export const METER_BARS_SELECTOR =
  'div[style*="align-items: flex-end"][style*="overflow: hidden"]';
/**
 * CSS selector for the SIGNAL footer ROW (Profile view) — the flex row
 * ancestor holding the "SIGNAL" label, the meter-bars container, the
 * net-readout span, and the coordinates label.
 *
 * This, not the readout span or the meter-bars container individually, is
 * the mask target. Root-caused churn (verifier evidence, consecutive
 * `pnpm goldens` runs): the readout's pixel width depends on real Resource
 * Timing text ("X.X Mb/s · NNN ms · TYPE") and the bars' heights depend on
 * real load measurements — neither is frozen by the faked clock, so a mask
 * built from those elements' own geometry shifts by a few px run-to-run,
 * exposing/hiding real content at its boundary (observed: ~280px churn in
 * 07-profile at both viewports, always inside this row's own box —
 * 1512x945 churn y=[864,889] versus this row's y=[855,890]; 1920x1080
 * churn y=[999,1024] versus this row's y=[990,1025]).
 *
 * The row's own bounding box, in contrast, is fixed by static CSS alone:
 * its width comes from the parent panel (flex layout, not the readout
 * text), its height from the meter's fixed 26px-tall bars container plus
 * fixed padding and line-height — none of which vary with live
 * measurements. Masking the row is therefore deterministic across runs
 * while still only covering the footer strip (not blanketing the view);
 * it incidentally also covers the static "SIGNAL" label and the
 * coordinates label, which is harmless (their content never changes) and
 * simpler than carving a mask that excludes them.
 */
export const SIGNAL_ROW_SELECTOR =
  'div[style*="border-top: 1px solid rgba(224, 69, 60, 0.25)"]';

/**
 * Selector for the status-bar windows-list container (`1:builds
 * 2:personnel 3:retina-v 4:profile`), masked only for the "08-tracker"
 * recipe.
 *
 * PLAN.md bug fix 1 (approved deviation): the unpatched prototype renders
 * the active Retina-V window appended *after* profile
 * ("…4:profile 3:retina-v*" — Homepage.dc.html lines 451/454) instead of in
 * numeric order. The vendored reference is intentionally NOT patched for
 * this (README-PATCH.md's contract is exactly two edits, both required
 * only by the no-network constraint — this bug has no such requirement),
 * so the committed 08-tracker goldens faithfully reproduce the prototype's
 * buggy order while the real implementation renders the fixed order
 * ("1:builds 2:personnel 3:retina-v* 4:profile" — StatusBar.svelte). That
 * is a structural, not antialiasing, pixel difference (~2370px, over the
 * plan's 0.0005 maxDiffPixelRatio relaxation ceiling), so it cannot be
 * reconciled by threshold relaxation — masking this one row is the only
 * option, mirroring the SIGNAL_ROW_SELECTOR precedent above. No coverage
 * is lost: tests/e2e/nav.spec.ts asserts the exact windows text
 * ("1:builds 2:personnel 3:retina-v* 4:profile") for the tracker view via
 * a real DOM read, independent of any screenshot.
 *
 * Matched two ways because the two sides serialize the same authored
 * inline style differently: the prototype is React-rendered, so its style
 * attribute is normalized to `color: rgb(95, 198, 180)` (space after each
 * colon, rgb() functional notation); the real implementation is Astro-SSR'd
 * static markup, so it keeps the authored `color:#5fc6b4` verbatim (but
 * carries `data-testid="status-bar-windows"`, which the prototype has no
 * equivalent of). A comma-list matches whichever branch applies per side
 * and de-duplicates automatically if a page somehow matched both.
 */
export const STATUS_BAR_WINDOWS_SELECTOR =
  '[data-testid="status-bar-windows"], div[style*="color: rgb(95, 198, 180)"]';

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {import('./recipes.ts').Recipe} recipe
 * @returns {Promise<Buffer>} PNG bytes
 */
export async function captureState(page, url, recipe) {
  // PLAN.md Phase 5B item 5B.5: pre-seed the boot-seen sessionStorage flag
  // BEFORE navigation so BootSequence.svelte's ~4.6s unskippable sequence
  // never runs during a golden capture — these 10 (soon 12, see
  // recipes.ts's `bootRecipes`, captured separately once Phase 6 wires
  // their own path) recipes all want the READY dashboard/view state,
  // exactly as before this feature existed. Harmless against the vendored
  // prototype reference (capture-goldens.mjs's other caller): that page
  // has no sessionStorage-aware boot code at all, so the flag is simply
  // unread there.
  await page.addInitScript((key) => {
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      // ignore — same best-effort contract as src/lib/bootState.ts
    }
  }, BOOT_SEEN_STORAGE_KEY);

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
  const signalRow = page.locator(SIGNAL_ROW_SELECTOR);
  if (isProfile) {
    // Fail loudly if these selectors stop matching instead of silently
    // masking nothing, or masking the wrong (non-deterministic) box
    // (PLAN.md: net-readout + meter-strip masking is pre-authorized
    // because the meter measures real load timing even under a faked
    // Date; readout/meterBars are canaries only, signalRow is the actual
    // mask target — see SIGNAL_ROW_SELECTOR's comment for why).
    const readoutCount = await readout.count();
    const meterCount = await meterBars.count();
    const rowCount = await signalRow.count();
    if (readoutCount !== 1 || meterCount !== 1 || rowCount !== 1) {
      throw new Error(
        `07-profile mask selectors matched readout=${readoutCount} meterBars=${meterCount} signalRow=${rowCount}, expected 1 each`,
      );
    }
  }

  const isTracker = recipe.name === "08-tracker";
  const statusBarWindows = page.locator(STATUS_BAR_WINDOWS_SELECTOR);
  if (isTracker) {
    // See STATUS_BAR_WINDOWS_SELECTOR's comment: bug fix 1 makes this row
    // structurally differ between the (deliberately unpatched) prototype
    // golden and the fixed implementation, in every tracker-state capture.
    const windowsCount = await statusBarWindows.count();
    if (windowsCount !== 1) {
      throw new Error(`08-tracker mask selector matched windows=${windowsCount}, expected 1`);
    }
  }

  const mask = [signalRow];
  if (isTracker) mask.push(statusBarWindows);

  return page.screenshot({
    animations: "disabled",
    caret: "hide",
    mask,
  });
}

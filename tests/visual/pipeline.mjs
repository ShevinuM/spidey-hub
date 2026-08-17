// Shared capture pipeline (PLAN.md "Capture pipeline (identical for
// goldens and impl)"). Both tests/visual/capture-goldens.mjs (Phase 1,
// captures from the vendored prototype reference — now historical/guarded,
// see that file's header) and tests/visual/identical.spec.ts (captures
// from the real Astro build) call `captureState()` below so the two sides
// can never drift apart. `captureBootState()` (PLAN.md Phase 6 item 6.1),
// further down this file, is a second, deliberately SEPARATE capture
// function for the two boot-sequence recipes only — see its own header
// comment for why boot needs a different clock-control sequence entirely.
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
import { BOOT_HARD_STOP_MS, CLOCK_TIME, RUN_FOR_MS } from "./recipes.ts";
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
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {import('./recipes.ts').Recipe} recipe
 * @returns {Promise<Buffer>} PNG bytes
 */
export async function captureState(page, url, recipe) {
  // PLAN.md Phase 5B item 5B.5: pre-seed the boot-seen sessionStorage flag
  // BEFORE navigation so BootSequence.svelte's ~4.6s unskippable sequence
  // never runs during a golden capture — every recipe THIS function
  // captures (the original 10 plus `extraRecipes`/`cmdlineRecipes`) wants
  // the READY dashboard/view state, exactly as before boot existed. The
  // two `bootRecipes` entries are captured by `captureBootState()` below
  // instead, which deliberately does the OPPOSITE (no pre-seed — its whole
  // point is a genuine, unskipped boot). Harmless against the vendored
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

  // PLAN.md Phase 6 item 6.1 hazard note, resolved: "08-tracker" used to
  // also mask the status-bar windows-list row, because the vendored
  // prototype's UNPATCHED window-ordering bug (Retina-V appended after
  // Profile instead of in numeric order) made that row structurally differ
  // from our bug-fixed implementation in every tracker capture. Since
  // PLAN.md's re-baseline (6.2) retires the prototype as the goldens'
  // authority — both sides of every future comparison are OUR OWN
  // implementation — that discrepancy no longer exists: the row is static,
  // deterministic text with nothing else timing-sensitive about it, so the
  // mask (and its former selector/assertion) is simply deleted rather than
  // carried forward as dead weight. tests/e2e/nav.spec.ts still asserts the
  // exact windows text for the tracker view independently of any
  // screenshot, so no coverage is lost. (The SIGNAL_ROW_SELECTOR mask
  // above stays: that one exists because the Profile meter measures REAL
  // load-timing data even under a faked Date, which is still true
  // self-vs-self.)
  const mask = [signalRow];

  return page.screenshot({
    animations: "disabled",
    caret: "hide",
    mask,
  });
}

/**
 * Boot-sequence golden capture (PLAN.md Phase 6 item 6.1/6.2, recipes.ts's
 * `bootRecipes`) — a SEPARATE function from `captureState()` above, not a
 * branch inside it, because boot recipes need a fundamentally different
 * clock-control sequence to be deterministic, discovered by direct
 * empirical probing (isolated `page.clock` experiments against both a bare
 * `setInterval` and the real BootSequence.svelte component, each run
 * repeatedly to separate signal from one-off jitter) rather than assumed
 * from `captureState()`'s existing "install, goto, runFor" shape:
 *
 * 1. **`page.clock.install()` does NOT itself freeze `Date.now()`** — real
 *    wall-clock time keeps advancing after install until the FIRST
 *    explicit control call (`runFor`/`pauseAt`/etc). Measured directly: a
 *    plain `page.goto()` against this app's own dev server let 27-61ms of
 *    real time leak into `Date.now()` before any control call, purely from
 *    page-load/hydration jitter — irrelevant to `captureState()`'s other
 *    ten recipes (their `RUN_FOR_MS` dwarfs it and nothing they render is
 *    sensitive to sub-second elapsed precision) but fatal to boot's
 *    elapsed-driven pct/phase/handshake/log math, whose `t0` is captured
 *    inside BootSequence.svelte's own mount effect the instant it runs —
 *    proven by a raw `clock.runFor(offsetMs)` (no pre-navigation freeze)
 *    landing on a DIFFERENT `data-elapsed` on three separate runs (1898,
 *    1960, 1963 for a nominal 2000ms target). The fix: call
 *    `page.clock.pauseAt(<install time>)` as the FIRST action after
 *    `install()`, BEFORE `page.goto()` — confirmed empirically to pin
 *    `Date.now()` to that exact instant through navigation, hydration, and
 *    an arbitrary additional real-time wait (5/5 identical runs, `elapsed`
 *    landing on the EXACT millisecond target every time thereafter).
 * 2. **`pauseAt()` only fires timers that already existed at the moment
 *    it's called — not ones a callback schedules DURING that same jump.**
 *    BootSequence.svelte's `finish()` (called from inside the tick
 *    interval or the hard-stop timeout) itself schedules the outro's
 *    `setTimeout(…, OUT_MS)`; a single `pauseAt(t0 + <far past hard-stop>)`
 *    measurably never fires that nested timeout (confirmed: `boot-sequence`
 *    stayed mounted and `data-elapsed` stuck at `dur()` across a sweep of
 *    ten offsets from `dur()` up to `dur() + 2400`ms). Reaching the
 *    post-outro "ready" terminal state therefore needs TWO sequential
 *    `pauseAt` calls: one just past the hard-stop (so `finish()` runs and
 *    schedules the outro timer), then a second past the outro hold (so
 *    THAT timer, now pre-existing, fires) — confirmed deterministic across
 *    repeated runs.
 *
 * Neither hazard is specific to this app's code — both are read straight
 * off Playwright's Clock API's own documented/observed semantics — so any
 * `clockOffsetMs` past `BOOT_HARD_STOP_MS` (recipes.ts) is staged through
 * automatically; offsets at or before it resolve in the single final
 * `pauseAt` alone.
 *
 * No boot-seen sessionStorage pre-seed here (the opposite of
 * `captureState()`) — a boot golden's entire point is to capture a GENUINE,
 * unskipped boot.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {import('./recipes.ts').BootRecipe} bootRecipe
 * @returns {Promise<Buffer>} PNG bytes
 */
export async function captureBootState(page, url, bootRecipe) {
  await page.route("**/api.github.com/**", (route) => route.abort());

  await page.clock.install({ time: CLOCK_TIME });
  const t0 = new Date(CLOCK_TIME).getTime();
  await page.clock.pauseAt(t0);

  await page.goto(url, { waitUntil: "load" });
  await page
    .locator('[data-testid="boot-sequence"][data-boot-running="true"]')
    .waitFor({ state: "attached", timeout: 15000 });

  if (bootRecipe.clockOffsetMs > BOOT_HARD_STOP_MS) {
    // Stage through the hard-stop first so finish()'s outro setTimeout has
    // actually been SCHEDULED (not just due) before the final jump — see
    // this function's header comment, hazard 2.
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

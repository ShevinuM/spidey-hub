# Visual-regression capture pipeline

`tests/visual/pipeline.mjs`'s `captureState()` is the single implementation
of PLAN.md's "Capture pipeline (identical for goldens and impl)" contract.
`tests/visual/capture-goldens.mjs` (Phase 1) and `tests/visual/identical.spec.ts`
(Phase 3+) both call it so the two sides cannot drift apart.

## Order of operations

1. `page.clock.install({ time: '2026-08-15T23:34:00' })` — **before** navigation.
2. `page.goto(url, { waitUntil: 'load' })`.
3. `page.clock.runFor(RUN_FOR_MS)` (5000ms by default, from `recipes.ts`).
4. Wait for the `SHEVINUM.DEV` plate (dashboard-only marker) to prove the
   app mounted and its keydown listener is attached.
5. Replay the recipe's key/type actions.
6. `page.clock.runFor(RUN_FOR_MS)` again.
7. Wait `document.fonts.ready`, then Playwright's `networkidle` load state.
8. `page.screenshot({ animations: 'disabled', caret: 'hide', mask: [...] })`.

Total fake-clock advance is `2 * RUN_FOR_MS` (10s by default) — comfortably
under 60s, so the displayed minute stays `23:34` throughout.

### Why runFor happens twice, not once

With a fully faked clock, nothing beyond the synchronous first render
happens until time is advanced — so step 3 must run *before* step 4's
selector wait or step 5's key dispatch, otherwise either can hang (nothing
ever mounts) or a key can land before the listener that would handle it
exists. Step 6's second `runFor` then flushes whatever rAF loop belongs to
the view the recipe just switched to (tracker sweep, SIGNAL meter, grep
overlay), which only starts ticking after step 5's state change — a single
`runFor` before the keys would leave those loops unflushed at capture time.

### Masks

`NET_READOUT_SELECTOR` and `METER_BARS_SELECTOR` (Profile view's SIGNAL
footer) are masked on every capture, not only when divergence is observed:
the meter measures real load timing (Resource Timing / a probe `Image()`),
so its readout text and bar heights are not made deterministic by faking
`Date` alone. For the `07-profile` recipe specifically, both locators are
asserted to match exactly one element each before the screenshot is taken,
so a selector regression (e.g. the browser re-serializing an inline
`style` attribute differently than the HTML source — see the space-after-
colon note in `pipeline.mjs`) fails the capture loudly instead of silently
masking nothing.

## Determinism check (Phase 1)

`pnpm goldens` was run three times back-to-back (fresh browser launch each
time) and all 60 output files (20 goldens × 3 runs) were SHA-256 compared:

- 18/20 goldens were **byte-identical** across all three runs.
- 2/20 (`1920x1080/01-dashboard.png`, `1920x1080/06-editor.png`) differed
  between two of the three runs by **exactly 1 pixel**, with a max
  per-channel delta of **1** (e.g. `[9,12,16]` vs `[9,11,16]`) — visually
  imperceptible, located in the blurred wallpaper backdrop (`blur(3px)`
  panes), not in any text, mask, or dynamic-content region. This is
  consistent with ordinary Chromium GPU/compositor floating-point jitter in
  blur rasterization, not a flaw in the clock/mask contract above (it does
  not reproduce in the same pixel every time, and does not correlate with
  any of the masked or timing-sensitive elements).
- Ratio: 1 / 2,073,600 ≈ 4.8e-7 — about 1000× below PLAN.md's pre-
  authorized `maxDiffPixelRatio: 0.0005` relaxation ceiling for
  antialiasing noise.

This is noted here for Phase 3: `identical.spec.ts` starts at
`maxDiffPixels: 0` per PLAN.md, and blurred-panel screenshots may
occasionally need the same tiny tolerance rather than a widened mask —
this is not something `capture-goldens.mjs` can eliminate (it isn't driven
by the fake clock, network, or fonts) without disabling GPU rasterization,
which was judged out of scope for Phase 1.

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

The Profile view's SIGNAL footer contains the net-readout span and the
60-bar meter, both driven by real load-timing measurements (Resource
Timing / a probe `Image()`) that a faked `Date` does not freeze. An
earlier version of this pipeline masked those two elements directly
(`NET_READOUT_SELECTOR`, `METER_BARS_SELECTOR`) — but their own pixel
geometry is exactly as undetermined as their content: the readout's width
tracks its text (`X.X Mb/s · NNN ms · TYPE`) and the bars' heights track
real measurements, so a mask built from their bounding boxes shifted by a
few px run-to-run and exposed/hid real pixels at the mask edge (observed:
280px of `07-profile` churn at both viewports across consecutive `pnpm
goldens` runs — see git history on this file and `pipeline.mjs` for the
fix).

The mask now targets `SIGNAL_ROW_SELECTOR` — the flex row *ancestor* that
contains the SIGNAL label, the meter-bars container, the readout span, and
the coordinates label. That row's own bounding box is fixed by static CSS
alone (width from the parent panel's flex layout, height from the meter's
fixed 26px-tall bars container plus fixed padding), so masking it is
deterministic across runs while still only covering the footer strip, not
a larger area of the view. It incidentally also covers the always-static
SIGNAL label and coordinates text, which is harmless.

`NET_READOUT_SELECTOR` and `METER_BARS_SELECTOR` are kept as structural
canaries only (no longer mask targets): for the `07-profile` recipe, all
three selectors (readout, meter bars, signal row) are asserted to match
exactly one element each before the screenshot is taken, so a selector
regression (e.g. the browser re-serializing an inline `style` attribute
differently than the HTML source — see the space-after-colon note in
`pipeline.mjs`) fails the capture loudly instead of silently masking
nothing or masking the wrong box.

## Determinism check (Phase 1)

`pnpm goldens` was run three times back-to-back (fresh browser launch each
time) and all 60 output files (20 goldens × 3 runs) were SHA-256 compared:

- **19/20 goldens were byte-identical across all three runs**, including
  both `07-profile` goldens (`1512x945` and `1920x1080`) — the file that
  previously churned by 280px per run before the `SIGNAL_ROW_SELECTOR`
  mask fix above.
- 1/20 differed: `1920x1080/06-editor.png` had **exactly 1 pixel** differ
  between one run and the other two, with a max per-channel delta of
  **1** — visually imperceptible, located in a blurred backdrop
  (`blur(3px)` pane), not in any text, mask, or dynamic-content region.
  This is consistent with ordinary Chromium GPU/compositor
  floating-point jitter in blur rasterization: it does not reproduce in
  the same pixel every run, and does not correlate with any masked or
  timing-sensitive element. *Which* golden exhibits this 1px jitter (if
  any) is not fixed from run to run — a prior determinism check on this
  same harness saw it in `1920x1080/01-dashboard.png` and
  `1920x1080/06-editor.png` instead; treat "0 or 1 files, 1px, blurred
  pane" as the invariant, not a specific filename.
- Ratio: 1 / 2,073,600 ≈ 4.8e-7 — about 1000× below PLAN.md's pre-
  authorized `maxDiffPixelRatio: 0.0005` relaxation ceiling for
  antialiasing noise.

This is noted here for Phase 3: `identical.spec.ts` starts at
`maxDiffPixels: 0` per PLAN.md, and blurred-panel screenshots may
occasionally need the same tiny tolerance rather than a widened mask —
this is not something `capture-goldens.mjs` can eliminate (it isn't driven
by the fake clock, network, or fonts) without disabling GPU rasterization,
which was judged out of scope for Phase 1. `07-profile`, by contrast, is
expected to be exactly byte-identical every run at both viewports — any
future churn there is a mask-geometry regression, not GPU noise, and
should be root-caused the same way this one was (compare consecutive
`pnpm goldens` outputs pixel-by-pixel, not just visually).

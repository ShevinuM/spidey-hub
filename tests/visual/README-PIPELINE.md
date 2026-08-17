# Visual-regression capture pipeline

`tests/visual/pipeline.mjs`'s `captureState()` is the single implementation
of PLAN.md's "Capture pipeline (identical for goldens and impl)" contract.
`tests/visual/capture-goldens.mjs` (Phase 1) and `tests/visual/identical.spec.ts`
(Phase 3+) both call it so the two sides cannot drift apart. A second
function, `captureBootState()`, exists solely for the two boot-sequence
recipes — see "Boot-sequence goldens" below.

## History: goldens are now self-baselines (PLAN.md Phase 6)

Through Phase 5, `tests/visual/goldens/` was captured from, and compared
against, a vendored copy of the ORIGINAL design prototype
(`tests/visual/reference/Homepage.dc.html`) — `capture-goldens.mjs` produced
the goldens from that prototype, and `identical.spec.ts` asserted our own,
still-being-built implementation matched them pixel-for-pixel. That made
sense while the implementation was still catching up to a fixed target, but
by Phase 6 the target itself had moved: 16 user-approved changes (tmux-
faithful navigation, a rebuilt Builds model, 3-level Personnel, a vim
engine, advanced tmux bindings, a boot sequence, a floating cmdline, etc.)
deliberately diverge from the prototype's own behavior, and 5 of the 15
final recipes (`11-help`, `12-all-projects`, `13-boot-mid`, `14-boot-ready`,
`15-cmdline`) reach states the prototype has no code path for at all.

As of the Phase 6 re-baseline, `tests/visual/goldens/` is captured directly
from OUR implementation via:

```
pnpm build:fixtures && playwright test tests/visual/identical.spec.ts --update-snapshots
```

— and `identical.spec.ts` continues to assert against those same committed
files on every subsequent run. The goldens are now **self-baselines**: they
record "does the implementation still render what it rendered last time
we deliberately accepted a change," not "does it match the vendored
prototype." `tests/visual/reference/` and `capture-goldens.mjs` are kept
only as a HISTORICAL record of how the very first (Phase 1) baseline was
produced — `capture-goldens.mjs` refuses to run without an explicit
`--restore-prototype-parity` override flag for exactly this reason (see
its own header comment): running it unguarded would silently overwrite the
self-baselines with prototype screenshots and un-fix every intentional
behavioral deviation documented throughout this codebase.

**Re-baseline procedure**, whenever a deliberate UI/behavior change legitimately
changes a golden's expected pixels:

1. Make the code change.
2. `pnpm build:fixtures && playwright test tests/visual/identical.spec.ts --update-snapshots`
   to regenerate every affected `.png` under `tests/visual/goldens/`.
3. Run `pnpm test:visual` **three consecutive times** and confirm all three
   are clean (0 failures) — this is the project's determinism gate for the
   capture pipeline itself (masks, clock control, network determinism).
   A recipe that only fails intermittently after step 2 means the new
   golden baked in something non-deterministic (a live measurement, a race,
   GPU rasterization jitter) — fix the underlying nondeterminism (a mask,
   a wait, a clock-control fix) rather than re-running `--update-snapshots`
   until it happens to pass once.
4. Review the diff: `git diff --stat tests/visual/goldens/` should only
   touch the `.png` files you expected to change from your code change.
   Inspect the new/changed PNGs yourself (not just trust the byte diff) for
   obvious rendering defects before committing.

## Boot-sequence goldens (`13-boot-mid`, `14-boot-ready`)

These two recipes (`tests/visual/recipes.ts`'s `bootRecipes`) are captured
by a SEPARATE function, `captureBootState()`, not `captureState()` — a
still-running, elapsed-time-driven overlay needs a different clock-control
sequence to be deterministic than every other recipe (all 13 of which
capture a settled view with boot already skipped via the sessionStorage
flag). Two hazards, found by direct empirical probing rather than assumed
from `captureState()`'s existing shape, drove that design — both are
documented in full in `captureBootState()`'s own header comment in
pipeline.mjs:

1. `page.clock.install()` does not itself freeze `Date.now()` — real
   wall-clock time (including page-load/hydration jitter) keeps leaking in
   until the first explicit clock-control call, which is fatal to a
   recipe whose entire rendered state is a function of elapsed milliseconds.
   Fixed by pausing the clock to the install time immediately, before
   navigation.
2. `page.clock.pauseAt()` only fires timers that already existed at the
   moment it is called, not ones a callback schedules during that same
   jump — so reaching the post-outro terminal state needs two sequential
   `pauseAt` calls (one just past the hard-stop, one past the outro hold),
   not one straight to the target offset.

Fidelity target for reviewing these two goldens: the `Boot Sequence.dc.html`
SOURCE that `BootSequence.svelte`/`boot.ts`/`boot.yaml` were transcribed
from (styles, geometry, keyframe timings, copy) — NOT
`project/ref/*.png`, which the Phase 5B executor determined are screenshots
of an earlier, contradicted design iteration (a skippable boot, a
different command line, an extra status-box row).

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

**Removed in Phase 6**: a third mask, `STATUS_BAR_WINDOWS_SELECTOR`, used
to cover the `08-tracker` recipe's status-bar windows-list row. It existed
only to reconcile the vendored prototype's UNPATCHED window-ordering bug
(Retina-V appended after Profile instead of in numeric order) against our
bug-fixed implementation — a structural, not antialiasing, difference in
every tracker capture while the prototype was still the goldens' authority.
Now that the goldens are self-baselines (both sides of every comparison are
this same implementation, see "History" above), that row is just static,
deterministic text with nothing else timing-sensitive about it, so the mask
was deleted rather than carried forward as dead weight —
`tests/e2e/nav.spec.ts` still asserts the exact windows text for the
tracker view independently of any screenshot, so no coverage was lost.

## Determinism check (Phase 1, historical)

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

## Determinism check (Phase 6 re-baseline)

After the `--update-snapshots` re-baseline described above (15 recipes × 2
viewports = 30 goldens, all captured fresh from this implementation),
`pnpm test:visual` was run **three consecutive times** against the same
committed goldens with no changes in between — the project's gate for
accepting a re-baseline (see "Re-baseline procedure" above):

- **Run 1: 30/30 passed. Run 2: 30/30 passed. Run 3: 30/30 passed.** Every
  recipe at both viewports, including the two boot goldens and the
  cmdline/all-projects/help additions, matched at `maxDiffPixels: 0` —
  the GPU blur-rasterization jitter documented above for the Phase 1
  baseline did not reproduce in any of the three runs this time.
- `RATIO_RELAXED` (identical.spec.ts) was therefore left EMPTY rather than
  carrying forward the pre-Phase-6 "02-builds"/"03-builds-j"/"06-editor"
  relaxations — those existed only to reconcile the vendored prototype's
  own AA rendering against ours (a discrepancy that no longer exists once
  both sides of the comparison are this same implementation); see
  identical.spec.ts's own comment on `RATIO_RELAXED` for the exact
  reasoning and the bar any future addition must clear (fresh
  three-run forensics, not the retired prototype-skew rationale).
- Every new/changed golden (`11-help`, `12-all-projects`, `13-boot-mid`,
  `14-boot-ready`, `15-cmdline`, plus the corrected `03-builds-j`/
  `05-personnel-l1`/`06-editor`) was also inspected visually (not just
  byte-diffed) for rendering defects — blank panels, clipped text, missing
  overlays — before being accepted; none were found. `14-boot-ready` is
  visually identical to `01-dashboard`, as expected: the boot hand-off
  lands on exactly the same ready-dashboard state a boot-skipped load
  reaches directly.

If a future re-baseline sees this gate fail (any of the three runs differ
from the committed goldens or from each other), do not chase it away with
`--update-snapshots` again — root-cause the nondeterminism first (a
missing mask, an un-flushed timer, a live measurement) the same way this
file's Phase 1/Phase 6 sections both did.

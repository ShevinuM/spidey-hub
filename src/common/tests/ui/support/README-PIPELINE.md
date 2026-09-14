# Visual-regression capture pipeline

`src/common/tests/ui/support/pipeline.mjs`'s `captureState()` is the single
implementation of the "Capture pipeline (identical for goldens and impl)"
contract. `src/common/tests/ui/support/capture-goldens.mjs` and
`tests/visual/identical.spec.ts` both call it so the two sides cannot drift
apart. A second
function, `captureBootState()`, exists solely for the two boot-sequence
recipes — see "Boot-sequence goldens" below.

## History: goldens are now self-baselines

Originally, `tests/visual/goldens/` was captured from, and compared
against, a vendored copy of the ORIGINAL design prototype
(`reference/Homepage.dc.html`) — `capture-goldens.mjs` produced
the goldens from that prototype, and `identical.spec.ts` asserted our own,
still-being-built implementation matched them pixel-for-pixel. That made
sense while the implementation was still catching up to a fixed target, but
the target itself has since moved: 16 user-approved changes (tmux-
faithful navigation, a rebuilt Builds model, 3-level Personnel, a vim
engine, advanced tmux bindings, a boot sequence, a floating cmdline, etc.)
deliberately diverge from the prototype's own behavior, and 5 of the 15
final recipes (`11-help`, `12-all-projects`, `13-boot-mid`, `14-boot-ready`,
`15-cmdline`) reach states the prototype has no code path for at all.
5 more of the latter kind were added (`16-shell` through
`20-help-search` — real panes/layouts/choose-tree/sessions/shell, the `?`
HelpSearch palette), bringing the total to 20 recipes / 40 goldens; none of
them are reachable through `capture-goldens.mjs`'s vendored-prototype path
either, for the same reason.

`tests/visual/goldens/` is captured directly
from OUR implementation via:

```
pnpm build:fixtures && playwright test tests/visual/identical.spec.ts --update-snapshots
```

— and `identical.spec.ts` continues to assert against those same committed
files on every subsequent run. The goldens are now **self-baselines**: they
record "does the implementation still render what it rendered last time
we deliberately accepted a change," not "does it match the vendored
prototype." `reference/` and `capture-goldens.mjs` are kept
only as a HISTORICAL record of how the very first baseline was
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

These two recipes (`recipes.ts`'s `bootRecipes`) are captured
by a SEPARATE function, `captureBootState()`, not `captureState()` — a
still-running, elapsed-time-driven overlay needs a different clock-control
sequence to be deterministic than every other recipe (all 19 of which
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

## Order of operations

0. `page.addInitScript(...)` pre-seeds two sessionStorage keys before
   navigation: the boot-skip flag and the toast-seed key
   (`TOAST_SEED_STORAGE_KEY`, `recipes.ts`'s fixed `TOAST_SEED`). The
   toast-seed key is written but currently inert: every golden capture
   builds with `PORTFOLIO_FIXTURES=1` (`pnpm build:fixtures`), and in that
   mode `NotificationsState` renders `buildFixtureState()`'s hand-authored,
   fixed item list directly, with no per-visit pool injection — so no toast
   is ever spawned during capture, and nothing in the current
   implementation reads `TOAST_SEED_STORAGE_KEY`. No goldens in this repo
   show a toast on screen — that is expected, not a capture-pipeline gap
   (see `src/features/notifications/tests/ui/e2e/notifications.spec.ts` for
   toast-visible/auto-dismiss coverage under real, non-frozen timing
   instead).
1. `page.clock.install({ time: '2026-08-15T23:34:00' })` — **before** navigation.
2. `page.goto(url, { waitUntil: 'load' })`.
3. `page.clock.runFor(RUN_FOR_MS)` (5000ms by default, from `recipes.ts`).
4. Wait for the dashboard-mount marker to prove the app mounted and its
   keydown listener is attached — `page.getByText("SHEVINUM.DEV").or(page
   .locator('[data-testid="dashboard-wordmark"]'))`, an `.or()` of BOTH the
   vendored prototype's literal plate text (still current for
   `capture-goldens.mjs`'s historical/guarded path, which has no
   `data-testid` attributes at all) and the real implementation's SPIDEY-HUB
   wordmark testid (the "SHEVINUM.DEV" title
   text was retired from the real dashboard entirely) — whichever side actually exists
   resolves first, so this one function keeps serving both callers.
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

**Removed**: a third mask, `STATUS_BAR_WINDOWS_SELECTOR`, used
to cover the `08-tracker` recipe's status-bar windows-list row. It existed
only to reconcile the vendored prototype's UNPATCHED window-ordering bug
(Retina-V appended after Profile instead of in numeric order) against our
bug-fixed implementation — a structural, not antialiasing, difference in
every tracker capture while the prototype was still the goldens' authority.
Now that the goldens are self-baselines (both sides of every comparison are
this same implementation, see "History" above), that row is just static,
deterministic text with nothing else timing-sensitive about it, so the mask
was deleted rather than carried forward as dead weight —
`src/common/tests/ui/e2e/nav.spec.ts` still asserts the exact windows text
for the tracker view independently of any screenshot, so no coverage was
lost.

## Determinism check (historical, original prototype baseline)

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
- Ratio: 1 / 2,073,600 ≈ 4.8e-7 — about 1000× below the pre-
  authorized `maxDiffPixelRatio: 0.0005` relaxation ceiling for
  antialiasing noise.

This is noted here because `identical.spec.ts` starts at
`maxDiffPixels: 0`, and blurred-panel screenshots may
occasionally need the same tiny tolerance rather than a widened mask —
this is not something `capture-goldens.mjs` can eliminate (it isn't driven
by the fake clock, network, or fonts) without disabling GPU rasterization,
which was judged out of scope originally. `07-profile`, by contrast, is
expected to be exactly byte-identical every run at both viewports — any
future churn there is a mask-geometry regression, not GPU noise, and
should be root-caused the same way this one was (compare consecutive
`pnpm goldens` outputs pixel-by-pixel, not just visually).

## Determinism check (initial self-baseline)

After the `--update-snapshots` re-baseline described above (15 recipes × 2
viewports = 30 goldens, all captured fresh from this implementation),
`pnpm test:visual` was run **three consecutive times** against the same
committed goldens with no changes in between — the project's gate for
accepting a re-baseline (see "Re-baseline procedure" above):

- **Run 1: 30/30 passed. Run 2: 30/30 passed. Run 3: 30/30 passed.** Every
  recipe at both viewports, including the two boot goldens and the
  cmdline/all-projects/help additions, matched at `maxDiffPixels: 0` —
  the GPU blur-rasterization jitter documented above for the original
  baseline did not reproduce in any of the three runs this time.
- `RATIO_RELAXED` (identical.spec.ts) was therefore left EMPTY rather than
  carrying forward the earlier "02-repositories"/"03-repositories-arrow"/"06-editor"
  relaxations — those existed only to reconcile the vendored prototype's
  own AA rendering against ours (a discrepancy that no longer exists once
  both sides of the comparison are this same implementation); see
  identical.spec.ts's own comment on `RATIO_RELAXED` for the exact
  reasoning and the bar any future addition must clear (fresh
  three-run forensics, not the retired prototype-skew rationale).
- Every new/changed golden (`11-help`, `12-all-projects`, `13-boot-mid`,
  `14-boot-ready`, `15-cmdline`, plus the corrected `03-repositories-arrow`/
  `05-employment-l1`/`06-editor`) was also inspected visually (not just
  byte-diffed) for rendering defects — blank panels, clipped text, missing
  overlays — before being accepted; none were found. `14-boot-ready` is
  visually identical to `01-dashboard`, as expected: the boot hand-off
  lands on exactly the same ready-dashboard state a boot-skipped load
  reaches directly.

If a future re-baseline sees this gate fail (any of the three runs differ
from the committed goldens or from each other), do not chase it away with
`--update-snapshots` again — root-cause the nondeterminism first (a
missing mask, an un-flushed timer, a live measurement) the same way this
file's determinism-check sections above both did.

## Determinism check (five-recipe expansion re-baseline)

This re-baseline re-validated all 15 prior recipes against the accumulated
changes (real data/repos, the SPIDEY-HUB dashboard rebrand + blur +
seeded toasts, the `?` HelpSearch palette replacing `?`→help, the in-window/
host shell, real panes/layouts/choose-tree/sessions) and added 5 more
(`16-shell` through `20-help-search`), bringing the total to 20 recipes / 40
goldens. Two capture-pipeline gaps were found and fixed as part of this
re-baseline, not after it:

- The dashboard-mount wait selector (`page.getByText("SHEVINUM.DEV")`) was
  stale — that title text had been retired from the real dashboard entirely
  in favor of the SPIDEY-HUB wordmark (`[data-testid="dashboard-wordmark"]`).
  Fixed with `.or()` so the same function still serves the vendored
  prototype's frozen HTML too (see `pipeline.mjs`'s own comment).
- The dashboard's seeded toast pick was not pinned —
  `captureState()`/`captureBootState()` now pre-seed
  `TOAST_SEED_STORAGE_KEY` (recipes.ts's fixed `TOAST_SEED`) via
  `addInitScript`, the same pattern as the boot-skip flag.

After `pnpm build:fixtures && playwright test tests/visual/identical.spec.ts
--update-snapshots` (run twice — once for the initial 20-recipe capture,
once more after a `src/features/help/content/help.yaml` content addition changed `11-help`/
`20-help-search`'s expected pixels), `pnpm test:visual` was run **three
consecutive times** against the final committed goldens with no changes in
between:

- **Run 1: 40/40 passed. Run 2: 40/40 passed. Run 3: 40/40 passed.** Every
  recipe at both viewports matched at `maxDiffPixels: 0` — the GPU
  blur-rasterization jitter documented in the historical section above did not
  reproduce in any of the three runs.
- Every new/changed golden was inspected visually (not just byte-diffed):
  the SPIDEY-HUB wordmark + blur on `01-dashboard`/`15-cmdline`/`16-shell`/
  `18-split` (no toast is visible in any of these — see the note on step 0
  above: fixture-mode captures never spawn a toast at all); the deterministic
  `neofetch` output
  (`Uptime: 0 min`) and renamed `0:zsh*` window on `16-shell`; the dim
  (non-blurred) radar + pre-seeded narrative + `[detached (from session
  10.42.7.13)]` on `17-host-shell`; the 3-pane main-vertical layout on
  `18-split`; the session/window tree + pane-program preview strip on
  `19-choose-tree`; the fuzzy "kil" result list (kill-window + kill-pane
  rows, no suggestion-list regression) on `20-help-search`; and the real
  Help-window content on `11-help` (the golden's visible scroll position is
  Global through the start of "tmux prefix" — unchanged from the prior
  capture; the new "Shell builtins" section added to help.yaml lives
  further down the same scrollable window and doesn't appear in this
  particular golden's viewport, but was confirmed present via
  `node --test`'s YAML-parse check and by scrolling the live app). None
  showed rendering defects.
- A byte-compare sweep (SHA-256 across every PNG per viewport) found zero
  duplicate pairs at either viewport — the "every golden meaningfully
  distinct" guard (re-verified rather than
  assumed per this file's "run them, don't trust them" lesson) holds for
  all 20×2.
- `RATIO_RELAXED` (identical.spec.ts) stays EMPTY — no recipe needed a
  tolerance relaxation.

## Determinism check (UI/UX fixes re-baseline)

This re-baseline landed a batch of 22 UI/UX fixes (blurred+darkened wallpaper
behind flat edge-to-edge views with the outer window-card chrome removed,
a plate-free white/red SPIDEY-HUB wordmark, a lazygit-style expanded Builds
tree with `all-projects` pinned first and selected by default, an `ls -l`
personnel preview with folder/file icons, a fixed-overlay auto-dismissing
toast, a one-line editor statusline, and more). After `pnpm build:fixtures && playwright test
tests/visual/identical.spec.ts --update-snapshots`, 30 of the 40 goldens
(15 of the 20 recipes, both viewports each) changed pixels; the other 5
recipes — `06-editor`, `08-tracker`, `13-boot-mid`, `17-host-shell`,
`19-choose-tree` — reach states where none of the batch's changes are
visible in-frame, e.g. `08-tracker`/retina-v is explicitly exempt from the
wallpaper blur/darken change.

While re-baselining, one stale recipe was caught and fixed rather than
blindly accepted: `"12-all-projects"` (`recipes.ts`) was written when the
virtual `all-projects` repo was the LAST row in Builds' local-repositories
list, and used `k`-wraparound from the default `selectedRepoIdx === 0` to
reach it. `all-projects` moved to be BOTH the first row
AND the default selection — so the old `k` press now wraps backward to the
last REAL repo instead, landing the golden on the wrong repo entirely (one
whose tree fixture failed to load, visible as a bare "Failed to load repo
index." string in panel [2] — an unmistakable tell that something was
wrong, not a legitimate new golden). Fixed by dropping the now-unnecessary
`k` and re-activating `all-projects` directly (`{key:"b"},{key:"3"},
{key:"Enter"}`), which still keeps this golden meaningfully distinct from
`"02-repositories"` (that one leaves panel [3] unfocused, so no row is
highlighted) while correctly exercising the all-projects state. See the
recipe's own updated comment in `recipes.ts` for the full account.

`pnpm test:visual` was then run **three consecutive times** against the
final committed goldens with no changes in between:

- **Run 1: 40/40 passed. Run 2: 40/40 passed. Run 3: 40/40 passed.** Every
  recipe at both viewports matched at `maxDiffPixels: 0` — the GPU
  blur-rasterization jitter documented in the historical section above did not
  reproduce in any of the three runs, despite this iteration adding a real
  CSS blur filter to the wallpaper behind most views (more blur surface
  area than any prior iteration).
- Every changed golden was inspected visually (not just byte-diffed): the
  blurred+darkened wallpaper and edge-to-edge flat chrome on `01-dashboard`/
  `02-repositories`/`03-repositories-arrow`/`04-employment-l0`/`05-employment-l1`/`11-help`/
  `16-shell`/`18-split`; the plate-free white-fill/red-stroke SPIDEY-HUB
  wordmark and absent `invert` cursor block on `01-dashboard`/`15-cmdline`/
  `16-shell`/`18-split`; the `ls -l`-style personnel preview (permissions,
  owner, date, name-last, folder/file icons, no `personnel-path`
  breadcrumb) on `04-employment-l0`/`05-employment-l1`; the corrected
  `12-all-projects` (all-projects row highlighted + activated, see above);
  and the one-line editor statusline surviving unchanged on `06-editor`.
  None showed rendering defects (no blank panels, no clipped text, no
  missing overlays). No toast is visible on screen in any golden — expected
  per the note under "Order of operations" step 0 above: fixture-mode
  captures never spawn a toast at all.
- `RATIO_RELAXED` (identical.spec.ts) stays EMPTY — no recipe needed a
  tolerance relaxation, including the newly-blurred wallpaper layer.

## Current baseline: 21 recipes / 42 goldens

Since the last determinism check above, the sitewide `builds`→`repositories`
/ "Personnel Files"→"Employment Records" rename rebaselined every recipe
that touches either view's status-bar/copy text without changing the recipe
count, and one more recipe was added: `21-notifications-panel-open` (the
signal-inbox panel open on the dashboard — see its own header comment in
`recipes.ts`). The current total is **21 recipes / 42 goldens**, and that is
the number any future re-baseline's "N/N passed" report should match.

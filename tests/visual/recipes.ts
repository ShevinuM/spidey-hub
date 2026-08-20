// Shared visual-regression state recipes ("Visual-regression
// harness"). Each recipe is a sequence of key/type actions replayed against
// a freshly loaded page to reach one of the states captured at each
// viewport.
//
// Action shapes:
//   { key: string }   -> page.keyboard.press(key)
//   { type: string }  -> page.keyboard.type(text)
export type RecipeAction = { key: string } | { type: string };

/**
 * A recipe-specific proof that the action list actually landed on the
 * intended on-screen state — not just "some page loaded" — checked by
 * `captureState()` (pipeline.mjs) right before the screenshot. Added after
 * a stale "03-builds-j" recipe (see git history) shipped a byte-identical,
 * zero-value golden because nothing verified its actions actually changed
 * the view. `url` and `visible` are independent: a recipe
 * that stays on the dashboard's route (an overlay) can supply `visible`
 * alone, one whose route changes but has no single distinguishing element
 * can supply `url` alone, and one where the route alone can't tell two
 * recipes apart (e.g. two Employment Records depths, both "/employment") should
 * supply both.
 */
export interface RecipeCheck {
  /** The page's pathname must match this after the recipe's actions run. */
  url?: RegExp;
  /** A Playwright locator selector that must resolve to a visible element
   * after the recipe's actions run. */
  visible?: string;
}

export interface Recipe {
  /** Golden filename stem, e.g. "01-dashboard" -> "01-dashboard.png". */
  name: string;
  actions: RecipeAction[];
  /** Optional "did this actually reach its intended view" proof — see
   * `RecipeCheck`. Only recipes converted off a removed single-key
   * dashboard/Repositories shortcut to the `C-b N`/arrow equivalent carry one;
   * older recipes are left as-is rather than retrofitted. */
  check?: RecipeCheck;
}

/**
 * The ORIGINAL 10 recipes (20 goldens at 2 viewports). Historically also
 * captured against the vendored prototype reference
 * (tests/visual/capture-goldens.mjs — guarded/historical, see that file's
 * header); that guarded path replays this same array unmodified, so any
 * `check` added below (which asserts against real-implementation
 * data-testids/routes the frozen prototype markup doesn't have) will fail
 * if that path is ever actually invoked — acceptable, since it already
 * requires an explicit override flag and is not part of normal
 * development. "11-help", "12-all-projects", the boot recipes, and
 * "15-cmdline" all live in their own sibling arrays below instead of being
 * appended here for the same "prototype has no code path for this state"
 * reason — identical.spec.ts imports and asserts the union of every array
 * on this page, capture-goldens.mjs only ever this one.
 *
 * Dashboard single-key view shortcuts (b/p/x/i/t/h) and Repositories' bare `j`
 * tree-navigation are removed from the app entirely — windows switch via
 * `Ctrl-b <N>` (window numbers: 1 repositories, 2 employment, 3 retina-v, 4
 * profile, 5 help) or a click, and Repositories panels navigate via ArrowUp/
 * ArrowDown. Every recipe below that used to press one of the removed keys
 * is rewritten accordingly, and carries a `check` (see `RecipeCheck`)
 * proving its `Ctrl-b <N>` chord actually landed on the intended view
 * rather than silently no-opping on the dashboard — the failure mode that
 * let a previous "03-builds-j" recipe ship a zero-value golden undetected
 * for months (see git history). "03-repositories-arrow" (was "03-builds-j")
 * explicitly focuses panel [1] (Repositories, bare `1`, unrelated to
 * the `Ctrl-b` prefix) before `ArrowDown`, which moves the repo-list
 * selection highlight. Employment Records v2 (docs/changes/
 * employment-records-v2.md) replaced its old 3-level drill-down with a flat
 * list + timeline: "05-employment-l1" (name kept from the old drill-down
 * recipe naming for golden-history continuity, despite there being no more
 * "level 1" to reach) now captures a non-default row selected (2 x `j`);
 * "06-editor" opens the shared vim editor directly from the flat list's
 * default selection (a single Enter, no drill-down chain to walk first).
 */
export const recipes: Recipe[] = [
  { name: "01-dashboard", actions: [] },
  {
    name: "02-repositories",
    actions: [{ key: "Control+b" }, { key: "1" }],
    check: { url: /\/repositories$/, visible: '[data-testid="repositories-panel-2"][data-copy-source]' },
  },
  {
    name: "03-repositories-arrow",
    actions: [{ key: "Control+b" }, { key: "1" }, { key: "1" }, { key: "ArrowDown" }],
    check: { url: /\/repositories$/, visible: '[data-testid="repositories-panel-1"][data-copy-source]' },
  },
  {
    name: "04-employment-l0",
    actions: [{ key: "Control+b" }, { key: "2" }],
    check: { url: /\/employment$/, visible: '[data-testid="employment-row"]' },
  },
  {
    // v2 (flat list + timeline, docs/changes/employment-records-v2.md): no
    // more drill-down levels to reach — repurposed to a non-default row
    // selected (2 x j from row 0), showing the preview panel and timeline
    // node following a moved selection live. `data-selected` (added for
    // this check) marks exactly one row at a time.
    name: "05-employment-l1",
    actions: [{ key: "Control+b" }, { key: "2" }, { key: "j" }, { key: "j" }],
    check: { url: /\/employment$/, visible: '[data-testid="employment-row"][data-selected]:nth-child(3)' },
  },
  {
    // Enter now opens the shared vim editor directly from the flat list's
    // default (row 0) selection — no drill-down chain left to walk first.
    name: "06-editor",
    actions: [{ key: "Control+b" }, { key: "2" }, { key: "Enter" }],
    check: { url: /\/employment$/, visible: '[data-testid="editor-scroller"]' },
  },
  {
    name: "07-profile",
    actions: [{ key: "Control+b" }, { key: "4" }],
    check: { url: /\/profile$/, visible: '[data-testid="profile-dossier"]' },
  },
  {
    name: "08-tracker",
    actions: [{ key: "Control+b" }, { key: "3" }],
    check: { url: /\/retina-v$/, visible: '[data-testid="wallpaper-layer"]' },
  },
  { name: "09-grep-empty", actions: [{ key: "/" }] },
  {
    name: "10-grep-query",
    actions: [{ key: "/" }, { type: "svelte" }],
  },
];

/**
 * Wires in 11-help and
 * 12-all-projects. Standard key/type `Recipe` shape (captured via the
 * same `captureState()` as the array above) but kept in their OWN array,
 * not appended to `recipes`, because they reach states the vendored
 * prototype has no code path for at all (help didn't exist as a window,
 * panel [3] had no virtual all-projects entry) — capture-goldens.mjs must
 * never be asked to run these against the prototype, even under its
 * refuse-by-default override flag (see that file's header comment).
 * identical.spec.ts is the only consumer.
 *
 * "11-help": the dashboard has no bare-key Help shortcut anymore (`h` and
 * every other single-key dashboard shortcut are removed) — the Help window
 * is reached with `Ctrl-b 5`, verified against views.ts's window-number
 * mapping and nav.spec.ts's own "Ctrl-b 5 switches to help" test.
 *
 * "12-all-projects": the virtual all-projects repo is the FIRST row in
 * panel [1]'s flat list and the default selection
 * (`selectedRepoIdx = $state(0)` in Repositories.svelte), so plain "02-repositories"
 * already lands on the all-projects tree with panel [1] unfocused (no row
 * highlighted). This recipe focuses panel [1] (bare `1`, unrelated to the
 * `Ctrl-b` prefix that switches windows) and re-activates the highlighted
 * all-projects row with `Enter`, which keeps this golden meaningfully
 * distinct from "02-repositories" (that highlighted-row state) while still
 * exercising all-projects explicitly rather than only via the page-load
 * default.
 */
export const extraRecipes: Recipe[] = [
  {
    name: "11-help",
    actions: [{ key: "Control+b" }, { key: "5" }],
    check: { url: /\/help$/, visible: '[data-testid="help-title"]' },
  },
  {
    name: "12-all-projects",
    actions: [{ key: "Control+b" }, { key: "1" }, { key: "1" }, { key: "Enter" }],
    check: { url: /\/repositories$/, visible: '[data-testid="repositories-panel-2"]:has-text("all-projects")' },
  },
];

/**
 * Boot-sequence recipes. Kept in their OWN array rather than merged into `recipes` or
 * `extraRecipes`: they have a fundamentally different action shape (a
 * clock offset, not a key/type replay — the boot overlay swallows all
 * input while active) AND the vendored prototype has no boot
 * sequence at all, so — same reasoning as `extraRecipes` above —
 * capture-goldens.mjs must never iterate these. Only identical.spec.ts
 * (via `captureBootState()` in pipeline.mjs, not `captureState()`)
 * consumes this array.
 *
 * `clockOffsetMs` is how far into (or past) the boot sequence to advance a
 * FAKED clock before the screenshot: the boot's own state (pct/phase/log
 * rows/handshake) is entirely a function of elapsed time, which a fixed
 * offset pins exactly PROVIDED the capture path also eliminates real-
 * wall-clock leakage into that elapsed value — see `captureBootState()`'s
 * own header comment in pipeline.mjs for the two determinism hazards this
 * required discriminating empirically (`page.clock.install()` does not
 * itself freeze `Date.now()` — real time keeps advancing until the first
 * explicit `pauseAt`/`runFor` call, which is long enough for page-
 * navigation jitter alone to shift a raw `clock.runFor(offset)` capture by
 * tens of milliseconds run to run; and `pauseAt()` only fires timers that
 * already existed at the moment it's called, not ones a callback
 * schedules *during* that same jump, so reaching the post-outro terminal
 * state needs two sequential `pauseAt` calls, not one). Boot's CSS
 * keyframe animations (the assembling rings' `swp`/`swpR` sweeps,
 * `bWave`/`bScan`, etc.) are separately NOT pinned by the JS clock at all
 * — only `page.screenshot({animations: "disabled"})` (already the
 * pipeline's own convention) freezes those, and must keep doing so here
 * exactly as it does for every other recipe.
 *
 * Fidelity target for the verifier's mandatory zoom review: the `Boot Sequence.dc.html`
 * SOURCE (styles/geometry/text transcribed into BootSequence.svelte/
 * boot.ts/boot.yaml) — NOT `project/ref/*.png`, which are screenshots of an earlier, contradicted design
 * (skippable boot, a different command line, an extra status-box row).
 */
export interface BootRecipe {
  name: string;
  /** Milliseconds of FAKED elapsed time (`page.clock`) to advance past
   * navigation before capturing — NOT wall-clock, and NOT one of the
   * `RecipeAction` key/type replays every other recipe uses. */
  clockOffsetMs: number;
}

/** Hand-mirrored from src/data/boot.yaml's `bootMs` (4600) and
 * BootSequence.svelte's own `OUT_MS` (760) — same "no runtime yaml import
 * outside the Vite pipeline" constraint tests/e2e/boot.spec.ts's own
 * identical literals are already subject to (see that file's header
 * comment); pipeline.mjs's `captureBootState()` needs these to know when a
 * `clockOffsetMs` crosses the hard-stop boundary and requires the two-stage
 * `pauseAt` sequence described above. */
export const BOOT_MS = 4600;
export const BOOT_HARD_STOP_MS = BOOT_MS + 60;
export const BOOT_OUT_MS = 760;

export const bootRecipes: BootRecipe[] = [
  // Mid-boot: comfortably inside the 4600ms default `bootMs` (src/data/
  // boot.yaml) — rings assembled (bAsmIn/bIn have all finished by ~1.15s),
  // progress ring/pct/phase/log/handshake all mid-flight and non-trivial
  // (phase should read SCAN or LINK, the boot log should have 3-5 visible
  // rows, the handshake should already read "OK · …"). Verified empirically
  // against the real formulas (src/lib/boot.ts): elapsed pins to EXACTLY
  // 2000 every run under captureBootState()'s two-stage-freeze approach,
  // yielding pct=63%/phase=LINK deterministically (5/5 repeated captures).
  { name: "13-boot-mid", clockOffsetMs: 2000 },
  // Post-outro: past bootMs (4600) + the hard-stop slack (60) + the
  // bBloom outro hold (760) with margin, i.e. the mock's `ready` dashboard
  // — this is BootSequence.svelte fully unmounted and the site chrome
  // mid/post its `bDashIn` entrance animation. A terminal state (no timer
  // is still running once reached), so the general "does real time leak in
  // afterward" hazard above doesn't apply to reading it — verified stable
  // across repeated captures.
  { name: "14-boot-ready", clockOffsetMs: BOOT_HARD_STOP_MS + 10 + BOOT_OUT_MS + 200 },
];

/**
 * Cmdline box recipe. Kept in its OWN array rather than
 * merged into `recipes` above — same reasoning as `extraRecipes`/
 * `bootRecipes`: the vendored prototype predates this feature entirely (no
 * code path, no golden), so `capture-goldens.mjs`'s guarded prototype-parity
 * run must never be asked to attempt it. `identical.spec.ts` is the only
 * consumer, via the standard `captureState()` (its action shape is the
 * ordinary key/type `Recipe`, unlike `bootRecipes`).
 *
 * The key sequence opens the box (`:` from the dashboard — no editor open,
 * no other text input active, so this is context (b), "site mode") and
 * types a short, deterministic partial query ("rep", a prefix of the
 * `repositories` command) so the golden captures the suggestion list mid-filter
 * — box open, partial query, suggestions visible. Never presses Enter (no
 * navigation side effect baked into the capture).
 */
export const cmdlineRecipes: Recipe[] = [{ name: "15-cmdline", actions: [{ key: ":" }, { type: "rep" }] }];

/**
 * Five recipes covering real pane splits, layouts, choose-tree, and the
 * in-window/host shell — kept
 * in their OWN array for the same reason every other post-vendored-prototype
 * array on this page is (`extraRecipes`/`bootRecipes`/`cmdlineRecipes`'s own
 * header comments): these states did not exist at the time the goldens
 * were self-baselined,
 * let alone in the vendored prototype `capture-goldens.mjs` replays against
 * — that script must never be asked to attempt them. `identical.spec.ts` is
 * the only consumer, via the same `captureState()` every recipe above (bar
 * `bootRecipes`) already uses.
 *
 * Every keystroke sequence below was verified against the CURRENT
 * implementation by tracing the actual dispatch code (Terminal.svelte's
 * `handleKey`/`handlePrefixedKey`) and cross-checking against the ground-
 * truth e2e specs that already exercise these exact sequences (panes.spec.ts,
 * choose-tree.spec.ts, sessions.spec.ts, shell.spec.ts, help-search.spec.ts)
 * — "run them, don't trust them": using sequences already proven live in a
 * real browser, not freshly guessed ones.
 *
 * A tmux prefix chord is TWO separate key actions, not one: `Ctrl-b` arms
 * the prefix (`{key: "Control+b"}`, Playwright's own down/press/up chord —
 * functionally identical to the hand-rolled down("Control")/press("b")/
 * up("Control") the e2e specs use, both producing the same single keydown
 * with `ctrlKey: true, key: "b"` Terminal.svelte's listener reads), then the
 * FOLLOWING key is pressed alone, unmodified, as its own action — real
 * tmux's own "prefix, then a key" model. `handlePrefixedKey` disarms the
 * prefix on every dispatch (Terminal.svelte), so repeating the same
 * prefixed key (e.g. the 5 Space presses below) needs a fresh `Control+b`
 * before EACH one, not just the first.
 */
export const iteration3Recipes: Recipe[] = [
  // "16-shell": the cmdline `q` command exits
  // the dashboard's program to an in-window shell (verified sequence,
  // shell.spec.ts's own `dropToShell()`: bare `:` opens site-mode Cmdline
  // from the dashboard, typing `q` + Enter runs the `:q`-equivalent exit).
  // `neofetch` (shell.ts's own builtin) is 100% data/clock-deterministic —
  // fixed ASCII art + yaml-driven fields + an uptime in whole MINUTES
  // (floors 10s of fake-clock advance to "0 min" every run) — unlike
  // `tree`/`cat`/`ls` against the real repo-root fs-index, which drifts
  // with every unrelated source-tree edit.
  {
    name: "16-shell",
    actions: [
      { key: ":" },
      { type: "q" },
      { key: "Enter" },
      { type: "neofetch" },
      { key: "Enter" },
    ],
  },
  // "17-host-shell": `Ctrl-b d` detach from a fresh
  // dashboard load — the pre-seeded host-shell narrative (shell.yaml's
  // `host.narrative`, `{session}` substituted with the real default session
  // name) plus the live-appended `[detached (from session …)]` line, shown
  // fullscreen over the dimmed (brightness, not blur) radar with no status
  // bar (sessions.spec.ts's own detach assertions).
  { name: "17-host-shell", actions: [{ key: "Control+b" }, { key: "d" }] },
  // "18-split": `Ctrl-b |` then `Ctrl-b -` reaches 3 panes (one full-height
  // pane on the left, two stacked on the right — panes.spec.ts's own
  // `makeThreePanes()`), then `Ctrl-b Space` cycled to main-vertical. A
  // manually-split window's `lastLayout` is unset (tmux.ts: "-1"), so the
  // FIRST bare Space lands on index 0 (even-horizontal) — reaching
  // main-vertical (index 4 of the 7-preset cycle: even-horizontal(0),
  // even-vertical(1), main-horizontal(2), main-horizontal-mirrored(3),
  // main-vertical(4)) needs exactly 5 total Space presses, each its own
  // freshly-armed `Ctrl-b` (verified directly against panes.spec.ts's own
  // 7-press layout-cycle test, whose 5th press is the same main-vertical
  // assertion this recipe targets).
  {
    name: "18-split",
    actions: [
      { key: "Control+b" },
      { key: "|" },
      { key: "Control+b" },
      { key: "-" },
      { key: "Control+b" },
      { key: " " },
      { key: "Control+b" },
      { key: " " },
      { key: "Control+b" },
      { key: " " },
      { key: "Control+b" },
      { key: " " },
      { key: "Control+b" },
      { key: " " },
    ],
  },
  // "19-choose-tree": `Ctrl-b w` from a window that already has a split,
  // so the overlay's
  // bottom preview strip has more than one pane program to actually
  // describe. Choose-tree itself needs no split precondition to OPEN
  // (choose-tree.spec.ts opens it from a plain single-pane `/repositories` too),
  // but this recipe deliberately gives it one for a more informative
  // golden.
  {
    name: "19-choose-tree",
    actions: [{ key: "Control+b" }, { key: "|" }, { key: "Control+b" }, { key: "w" }],
  },
  // "20-help-search": bare `?` opens the site-wide HelpSearch palette from
  // the dashboard, then the "kil" fuzzy canary
  // (help-search.spec.ts's own canary — surfaces both the kill-window and
  // kill-pane keymap rows) captures a populated, non-empty result list.
  { name: "20-help-search", actions: [{ key: "?" }, { type: "kil" }] },
];

export const viewports = [
  { name: "1512x945", width: 1512, height: 945 },
  { name: "1920x1080", width: 1920, height: 1080 },
] as const;

/** page.clock.install() time, per the capture pipeline contract. */
export const CLOCK_TIME = "2026-08-15T23:34:00";

/**
 * Fixed sub-60s clock.runFor() amount used identically on both sides
 * (goldens and the implementation), applied twice per the
 * pipeline contract in pipeline.mjs: once right after load (flushes the
 * boot/first-render rAF & timers) and once after the recipe's key sequence
 * (flushes the newly-entered view's own rAF loops, e.g. tracker sweep or
 * the SIGNAL meter). 5s + 5s keeps the wall-clock minute at 23:34 either
 * way (well under 60s), matching both the prototype's hardcoded
 * "23:34"/"15-Aug-26" text and the implementation's live clock (bug fix 2)
 * which will render the same text at this fixed instant.
 */
export const RUN_FOR_MS = 5000;

/**
 * The dashboard's seeded 2-of-pool
 * toast pick (src/lib/notifications.ts's
 * `resolveToastSeed()`/`pickToastPair()`) reads `Date.now()` in prod, which
 * would make every recipe that ever touches the dashboard window (its `id`
 * stays "dashboard" — and Toasts stays visible — even once its PROGRAM is
 * `shell`, e.g. "16-shell") pick a different, non-deterministic pair every
 * capture. `pipeline.mjs` pre-seeds `TOAST_SEED_STORAGE_KEY`
 * (src/lib/notifications.ts) with this fixed value via `addInitScript`,
 * mirroring tests/e2e/fixtures.ts's own `E2E_TOAST_SEED` pattern (a
 * different arbitrary constant — the two suites don't share fixtures, so
 * there is no requirement the values match, only that each is fixed).
 */
export const TOAST_SEED = 133742;

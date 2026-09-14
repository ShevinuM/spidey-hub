// A recipe is a sequence of key/type actions replayed against a freshly loaded page to
// reach one of the states captured at each viewport.
export type RecipeAction = { key: string } | { type: string };

/**
 * A recipe-specific proof that the action list actually landed on the intended on-screen
 * state, checked by `captureState()` (pipeline.mjs) right before the screenshot.
 *
 * `url` and `visible` are independent: a recipe that stays on the dashboard's route (an
 * overlay) can supply `visible` alone, one whose route changes but has no single
 * distinguishing element can supply `url` alone, and one where the route alone can't tell
 * two recipes apart should supply both.
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
  /** "Did this actually reach its intended view" proof — see `RecipeCheck`. */
  check?: RecipeCheck;
}

/**
 * Windows switch via `Ctrl-b <N>` (1 repositories, 2 employment, 3 retina-v, 4 profile, 5
 * help) or a click; Repositories panels navigate via ArrowUp/ArrowDown.
 *
 * "03-repositories-arrow" focuses panel [1] (bare `1`, unrelated to the `Ctrl-b` prefix)
 * before `ArrowDown`, which moves the repo-list selection highlight.
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
    // Row 0 (default selection) is `damage-control/evidence-cataloguer`, a deliberately
    // adversarial ~300-line record with an embedded 400-char unbroken line, so this golden
    // bakes in the resulting overflowing/scrolled preview panel on purpose (see
    // adversarial-fixtures.spec.ts).
    name: "04-employment-l0",
    actions: [{ key: "Control+b" }, { key: "2" }],
    check: { url: /\/employment$/, visible: '[data-testid="employment-row"]' },
  },
  {
    // Selects a non-default row (2 x j from row 0, landing on row 2 — 0-indexed, newest-first —
    // `damage-control/salvage-logistics-clerk`), showing the preview panel and timeline node
    // following the moved selection live.
    name: "05-employment-l1",
    actions: [{ key: "Control+b" }, { key: "2" }, { key: "j" }, { key: "j" }],
    check: { url: /\/employment$/, visible: '[data-testid="employment-row"][data-selected]:nth-child(3)' },
  },
  {
    // Enter opens the shared vim editor directly from the flat list's default (row 0) selection.
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
 * Kept in their own array, not appended to `recipes`, because they reach states the
 * vendored prototype has no code path for at all.
 *
 * "11-help" reaches the Help window with `Ctrl-b 5` — the dashboard has no bare-key
 * shortcut for it.
 *
 * "12-all-projects" focuses panel [1] (bare `1`) and re-activates the already-highlighted
 * all-projects row with `Enter`, keeping this golden distinct from "02-repositories"
 * (which lands on the same tree but with panel [1] unfocused).
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
 * Boot-sequence recipes, kept in their own array because they use a fundamentally different
 * action shape (a clock offset, not a key/type replay — the boot overlay swallows all input
 * while active) and the vendored prototype has no boot sequence at all.
 *
 * Only `identical.spec.ts` (via `captureBootState()` in pipeline.mjs) consumes this array.
 *
 * `clockOffsetMs` pins the boot's elapsed-time-driven state (pct/phase/log rows/handshake)
 * via a faked clock. An offset past the hard-stop needs two sequential `pauseAt` calls
 * (see `captureBootState()`'s header comment) so the outro's nested timeout is scheduled
 * before it fires. CSS keyframe animations are frozen separately, via
 * `page.screenshot({animations: "disabled"})`.
 */
export interface BootRecipe {
  name: string;
  /** Milliseconds of FAKED elapsed time (`page.clock`) to advance past
   * navigation before capturing — NOT wall-clock, and NOT one of the
   * `RecipeAction` key/type replays every other recipe uses. */
  clockOffsetMs: number;
}

/** Hand-mirrored from boot.yaml's `bootMs` (4600) and BootSequence.svelte's `OUT_MS` (760),
 * same constraint as the identical literals in boot.spec.ts — no runtime yaml import outside
 * the Vite pipeline. */
export const BOOT_MS = 4600;
export const BOOT_HARD_STOP_MS = BOOT_MS + 60;
export const BOOT_OUT_MS = 760;

export const bootRecipes: BootRecipe[] = [
  // Comfortably inside `bootMs`: rings assembled, progress ring/pct/phase/log/handshake all
  // mid-flight (phase SCAN or LINK, pct=63%).
  { name: "13-boot-mid", clockOffsetMs: 2000 },
  // Past `bootMs` + the hard-stop slack + the outro hold, with margin: BootSequence.svelte
  // is fully unmounted and the dashboard's own entrance animation is mid/post.
  { name: "14-boot-ready", clockOffsetMs: BOOT_HARD_STOP_MS + 10 + BOOT_OUT_MS + 200 },
];

/**
 * Kept in its own array for the same reason as `extraRecipes`/`bootRecipes` (see their
 * header comments). Never presses Enter, so the capture has no navigation side effect baked in.
 */
export const cmdlineRecipes: Recipe[] = [{ name: "15-cmdline", actions: [{ key: ":" }, { type: "rep" }] }];

/**
 * Five recipes covering pane splits, layouts, choose-tree, and the in-window/host shell —
 * kept in their own array for the same reason as the arrays above.
 *
 * A tmux prefix chord is two separate key actions: `Ctrl-b` arms the prefix, then the
 * following key is pressed alone, unmodified, as its own action. `handlePrefixedKey`
 * (Terminal.svelte) disarms the prefix on every dispatch, so repeating the same prefixed
 * key (e.g. the 5 Space presses below) needs a fresh `Control+b` before each one.
 */
export const iteration3Recipes: Recipe[] = [
  // `neofetch` (shell.ts's builtin) is fully deterministic — fixed ASCII art plus an
  // uptime floored to whole minutes — unlike `tree`/`cat`/`ls`, which drift with the real fs-index.
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
  // Detach shows the pre-seeded host-shell narrative (shell.yaml's `host.narrative`) fullscreen
  // over the dimmed radar with no status bar (see sessions.spec.ts's detach assertions).
  { name: "17-host-shell", actions: [{ key: "Control+b" }, { key: "d" }] },
  // A manually-split window's `lastLayout` is unset (tmux.ts), so the first bare Space lands
  // on even-horizontal (index 0); reaching main-vertical (index 4) needs 5 total Space presses.
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
  // Opens choose-tree from a window that already has a split so the overlay's bottom
  // preview strip has more than one pane program to describe.
  {
    name: "19-choose-tree",
    actions: [{ key: "Control+b" }, { key: "|" }, { key: "Control+b" }, { key: "w" }],
  },
  // The "kil" fuzzy canary (see help-search.spec.ts) surfaces both the kill-window and
  // kill-pane keymap rows, so the golden captures a populated, non-empty result list.
  { name: "20-help-search", actions: [{ key: "?" }, { type: "kil" }] },
];

/**
 * Kept in its own array, never merged into `recipes`, so it can't reach the vendored-prototype
 * path; `identical.spec.ts` is the only consumer.
 *
 * A bare `n` toggles the notifications panel while the dashboard is the active view
 * (Notifications.svelte's exported `handleKey`, wired through Terminal.svelte).
 * `check.visible` is required (not just a `url` check) because the panel is an overlay
 * on `/`, the same route the dashboard itself renders at.
 */
export const notificationsRecipes: Recipe[] = [
  {
    name: "21-notifications-panel-open",
    actions: [{ key: "n" }],
    check: { visible: '[data-testid="notifications-panel"]' },
  },
];

export const viewports = [
  { name: "1512x945", width: 1512, height: 945 },
  { name: "1920x1080", width: 1920, height: 1080 },
] as const;

/** page.clock.install() time, per the capture pipeline contract. */
export const CLOCK_TIME = "2026-08-15T23:34:00";

/**
 * Fixed sub-60s clock.runFor() amount applied twice by pipeline.mjs (after load, then
 * after the recipe's key sequence) so the wall-clock minute never rolls over between captures.
 */
export const RUN_FOR_MS = 5000;

export const TOAST_SEED = 133742;

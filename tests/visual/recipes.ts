// Shared visual-regression state recipes (PLAN.md "Visual-regression
// harness"). Each recipe is a sequence of key/type actions replayed against
// a freshly loaded page (prototype reference in Phase 1; the real
// implementation from Phase 3 on via tests/visual/identical.spec.ts) to
// reach one of the 10 states captured at each viewport (20 goldens total).
//
// Action shapes:
//   { key: string }   -> page.keyboard.press(key)
//   { type: string }  -> page.keyboard.type(text)
export type RecipeAction = { key: string } | { type: string };

export interface Recipe {
  /** Golden filename stem, e.g. "01-dashboard" -> "01-dashboard.png". */
  name: string;
  actions: RecipeAction[];
}

export const recipes: Recipe[] = [
  { name: "01-dashboard", actions: [] },
  { name: "02-builds", actions: [{ key: "b" }] },
  { name: "03-builds-j", actions: [{ key: "b" }, { key: "j" }] },
  { name: "04-personnel-l0", actions: [{ key: "x" }] },
  { name: "05-personnel-l1", actions: [{ key: "x" }, { key: "Enter" }] },
  {
    name: "06-editor",
    actions: [{ key: "x" }, { key: "Enter" }, { key: "Enter" }],
  },
  { name: "07-profile", actions: [{ key: "i" }] },
  { name: "08-tracker", actions: [{ key: "t" }] },
  { name: "09-grep-empty", actions: [{ key: "/" }] },
  {
    name: "10-grep-query",
    actions: [{ key: "/" }, { type: "svelte" }],
  },
];

/**
 * Boot-sequence recipes (PLAN.md Phase 5B item 5B.5). DEFINED here but
 * deliberately kept OUT of the `recipes` array above:
 * `capture-goldens.mjs` iterates `recipes` unconditionally against the
 * vendored prototype reference (which has no boot sequence at all — it
 * predates this feature entirely) and `identical.spec.ts` would fail
 * `toMatchSnapshot` for any name with no committed golden. Neither of
 * those recipe/pipeline entry points may be touched by this phase (PLAN.md
 * Phase 5B constraints: "do NOT run or capture visual goldens — Phase 6
 * does"). Phase 6 wires an actual capture path for these two names and
 * moves/merges them into `recipes` (or a sibling array `identical.spec.ts`
 * also consults) at that point, with the mandatory zoom-review against
 * `/Users/shev/Desktop/waiting-on-form-answers/project/ref/*.png`.
 *
 * Each recipe intentionally has NO key/type `actions` (the boot overlay
 * swallows all input while active — PLAN.md 5B.3) and instead carries a
 * `clockOffsetMs` describing how far into (or past) the boot sequence to
 * advance a FAKED clock before the screenshot — this is what determinism
 * requires here (see the comment on each entry): the boot's own state
 * (pct/phase/log rows/handshake) is entirely a function of elapsed time,
 * which a fixed clock offset pins exactly, but its CSS keyframe animations
 * (the assembling rings' `swp`/`swpR` sweeps, `bWave`/`bScan`, etc.) are
 * NOT pinned by the JS clock at all — only `page.screenshot({animations:
 * "disabled"})` (already the pipeline's own convention, see pipeline.mjs)
 * freezes those, and must keep doing so for these two recipes exactly as
 * it does for the existing ten.
 */
export interface BootRecipe {
  name: string;
  /** Milliseconds of FAKED elapsed time (`page.clock`) to advance past
   * navigation before capturing — NOT wall-clock, and NOT one of the
   * `RecipeAction` key/type replays every other recipe uses. */
  clockOffsetMs: number;
}

export const bootRecipes: BootRecipe[] = [
  // Mid-boot: comfortably inside the 4600ms default `bootMs` (src/data/
  // boot.yaml) — rings assembled (bAsmIn/bIn have all finished by ~1.15s),
  // progress ring/pct/phase/log/handshake all mid-flight and non-trivial
  // (phase should read SCAN or LINK, the boot log should have 3-5 visible
  // rows, the handshake should already read "OK · …").
  { name: "13-boot-mid", clockOffsetMs: 2000 },
  // Post-outro: past bootMs (4600) + the hard-stop slack (60) + the
  // bBloom outro hold (760) with margin, i.e. the mock's `ready` dashboard
  // — this is BootSequence.svelte fully unmounted and the site chrome
  // mid/post its `bDashIn` entrance animation.
  { name: "14-boot-ready", clockOffsetMs: 4600 + 60 + 760 + 200 },
];

/**
 * Cmdline box recipe (PLAN.md Phase 5C item 5C's visual recipe / Phase 6
 * item 6.1's "add ... 5C's 15-cmdline"). DEFINED here but deliberately kept
 * OUT of the `recipes` array above, same reasoning as `bootRecipes` just
 * above: `capture-goldens.mjs` runs `recipes` unconditionally against the
 * vendored prototype reference, which predates this feature entirely and
 * has no golden for it, and `identical.spec.ts` would fail `toMatchSnapshot`
 * for a name with no committed golden. Phase 6 moves/merges this into
 * `recipes` once it captures the real self-baseline.
 *
 * The key sequence opens the box (`:` from the dashboard — no editor open,
 * no other text input active, so this is context (b), "site mode") and
 * types a short, deterministic partial query ("bui", a prefix of the
 * `builds` command) so the golden captures the suggestion list mid-filter
 * — box open, partial query, suggestions visible, per PLAN.md 5C's own
 * description of what this recipe should show. Never presses Enter (no
 * navigation side effect baked into the capture).
 */
export const cmdlineRecipes: Recipe[] = [{ name: "15-cmdline", actions: [{ key: ":" }, { type: "bui" }] }];

export const viewports = [
  { name: "1512x945", width: 1512, height: 945 },
  { name: "1920x1080", width: 1920, height: 1080 },
] as const;

/** page.clock.install() time, per PLAN.md capture pipeline contract. */
export const CLOCK_TIME = "2026-08-15T23:34:00";

/**
 * Fixed sub-60s clock.runFor() amount used identically on both sides
 * (goldens and, from Phase 3, the implementation), applied twice per the
 * pipeline contract in pipeline.mjs: once right after load (flushes the
 * boot/first-render rAF & timers) and once after the recipe's key sequence
 * (flushes the newly-entered view's own rAF loops, e.g. tracker sweep or
 * the SIGNAL meter). 5s + 5s keeps the wall-clock minute at 23:34 either
 * way (well under 60s), matching both the prototype's hardcoded
 * "23:34"/"15-Aug-26" text and the implementation's live clock (bug fix 2)
 * which will render the same text at this fixed instant.
 */
export const RUN_FOR_MS = 5000;

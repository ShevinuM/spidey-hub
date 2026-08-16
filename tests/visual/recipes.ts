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

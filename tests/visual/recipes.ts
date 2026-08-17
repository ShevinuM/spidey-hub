// Shared visual-regression state recipes (PLAN.md "Visual-regression
// harness"). Each recipe is a sequence of key/type actions replayed against
// a freshly loaded page to reach one of the states captured at each
// viewport.
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

/**
 * The ORIGINAL 10 recipes (20 goldens at 2 viewports), captured against
 * BOTH the vendored prototype reference (tests/visual/capture-goldens.mjs
 * — Phase 1, now guarded/historical, see that file's header) and the real
 * implementation (tests/visual/identical.spec.ts). Kept deliberately
 * scoped to states the prototype itself can reach (no help window, no
 * all-projects, no boot sequence, no cmdline box — none of those existed
 * yet when the prototype was vendored), so capture-goldens.mjs's guarded
 * "restore prototype parity" path never has to attempt a state the
 * prototype has no code for. PLAN.md Phase 6 item 6.1's "11-help",
 * "12-all-projects", the boot recipes, and "15-cmdline" all live in their
 * own sibling arrays below instead of being appended here for exactly that
 * reason — identical.spec.ts imports and asserts the union of every array
 * on this page (15 recipes total), capture-goldens.mjs only ever this one.
 *
 * PLAN.md Phase 6 item 6.1 audit (executor, verified by actually running
 * every recipe against the current implementation, not by reading source
 * alone — see the fixed three below):
 *   - "03-builds-j": the Phase 4 Builds rework changed the default focused
 *     panel on entry to [2] Files (empty until a repo is opened), so the
 *     OLD action list `[{key:"b"},{key:"j"}]` pressed "j" against an empty,
 *     unfocused-for-input panel — confirmed empirically byte-IDENTICAL to
 *     "02-builds"'s own screenshot (Buffer.compare === 0), i.e. a
 *     zero-value golden. Fixed to explicitly focus panel [3] (Local
 *     Repositories, `{key:"3"}`) before "j", which moves the repo-list
 *     selection highlight — confirmed to produce a distinct screenshot.
 *   - "05-personnel-l1"/"06-editor": PLAN.md's own callout ("05/06
 *     personnel now need the 3-level path") — Personnel gained a middle
 *     employmentType level (PLAN.md Phase 2), so what used to be reachable
 *     in 1/2 Enters from the companies level now needs 2/3. Confirmed
 *     empirically: the OLD "06-editor" action list left `hasEditor: false`
 *     (it landed on the level-2 role-files LIST, one Enter short of
 *     `activateRoleRow`'s `editorOpen = true`) — i.e. "06-editor" never
 *     actually opened Editor.svelte, defeating the recipe's entire purpose
 *     (identical.spec.ts's own header comment already claims this is "the
 *     first pixel test of Editor.svelte itself"). Fixed by adding the one
 *     extra `Enter` each recipe needs to reach the equivalent depth as
 *     before the extra level was inserted — "05" now reaches the level-2
 *     role-files listing (the yazi-style file-browser pane at its OTHER
 *     depth, matching "04"'s dir listing at the companies level), "06"
 *     continues one more Enter into the actual editor.
 */
export const recipes: Recipe[] = [
  { name: "01-dashboard", actions: [] },
  { name: "02-builds", actions: [{ key: "b" }] },
  { name: "03-builds-j", actions: [{ key: "b" }, { key: "3" }, { key: "j" }] },
  { name: "04-personnel-l0", actions: [{ key: "x" }] },
  { name: "05-personnel-l1", actions: [{ key: "x" }, { key: "Enter" }, { key: "Enter" }] },
  {
    name: "06-editor",
    actions: [{ key: "x" }, { key: "Enter" }, { key: "Enter" }, { key: "Enter" }],
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
 * Iteration-2 recipes (PLAN.md Phase 6 item 6.1: "wire in 11-help,
 * 12-all-projects"). Standard key/type `Recipe` shape (captured via the
 * same `captureState()` as the array above) but kept in their OWN array,
 * not appended to `recipes`, because they reach states the vendored
 * prototype has no code path for at all (help didn't exist as a window,
 * panel [3] had no virtual all-projects entry) — capture-goldens.mjs must
 * never be asked to run these against the prototype, even under its
 * refuse-by-default override flag (see that file's header comment).
 * identical.spec.ts is the only consumer.
 *
 * "12-all-projects": the virtual all-projects repo is always the LAST row
 * in panel [3]'s flat list (Builds.svelte's `flatRepos` derivation pushes
 * it after every real project repo) — `k` from the default `selectedRepoIdx
 * === 0` wraps to that last row (`selectRepo`'s `((idx + delta) % n + n) %
 * n` modulo arithmetic) without needing to hand-count how many real repos
 * precede it, so this recipe stays correct if the fixture project count
 * ever changes. `Enter` then activates it, loading its tree (the fixture
 * projects' own .md files) into panel [2]. Verified empirically: lands on
 * `/builds`, panel [2]'s subtitle reads "- all-projects", and its tree
 * lists the fixture project markdown files.
 */
export const extraRecipes: Recipe[] = [
  { name: "11-help", actions: [{ key: "?" }] },
  { name: "12-all-projects", actions: [{ key: "b" }, { key: "3" }, { key: "k" }, { key: "Enter" }] },
];

/**
 * Boot-sequence recipes (PLAN.md Phase 5B item 5B.5, wired in by Phase 6
 * item 6.1). Kept in their OWN array rather than merged into `recipes` or
 * `extraRecipes`: they have a fundamentally different action shape (a
 * clock offset, not a key/type replay — the boot overlay swallows all
 * input while active, PLAN.md 5B.3) AND the vendored prototype has no boot
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
 * Fidelity target for the verifier's mandatory zoom review (PLAN.md 6.1,
 * updated by the docs commit at `bab6d29`): the `Boot Sequence.dc.html`
 * SOURCE (styles/geometry/text transcribed into BootSequence.svelte/
 * boot.ts/boot.yaml) — NOT `project/ref/*.png`, which the 5B executor
 * determined are screenshots of an earlier, contradicted design iteration
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

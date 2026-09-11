# Phase 05 — boot

> **Status: planned, not started.** Phase 04 is closed, so this phase is unblocked. Binding decisions: `Instructions/00-phases.md` (the only cross-phase document this plan may read). This plan is self-contained: every mechanism it needs is stated here verbatim, so the executor never reads another phase's folder.

## Context

**`src/features/boot`** — does not exist yet; this phase creates it. Everything below is scoped to it except the declared out-of-context wiring.

**Declared out-of-context wiring** (mechanical only — D24's closing clause; no behavioral edits outside the context, ever):

| file | why |
|---|---|
| `playwright.config.ts` | three project entries (§Mechanics 3) |
| `package.json` | `test:e2e` / `test:visual` explicit lists |
| `src/content.config.ts` | `boot` collection `base:` pointer (D22) |
| `src/common/lib/data.ts:29` | `boot.yaml` `?raw` import re-point (D17) |
| `src/pages/harness/[feature].astro` | one `boot` branch (D24) |
| `src/bootstrap/Terminal.svelte:57` | import path for `BootSequence.svelte` |
| **`common/tests/ui/support/pipeline.mjs:42`** | `BOOT_SEEN_STORAGE_KEY` import — **see ruling R1; the single easiest thing in this phase to miss, and it silently breaks every visual golden capture** |
| `common/tests/ui/support/fixtures.ts:40` | same key |
| `common/tests/ui/e2e/animations.spec.ts:26` | same key |
| `tests/visual/adversarial-fixtures.spec.ts:24` | same key |
| `tests/e2e/notifications-boot.spec.ts:19` | same key (spec stays in `legacy`; phase 06 relocates it) |
| `tests/e2e/toast-drain-arm.spec.ts:33` | same key (spec stays in `legacy`; phase 06 relocates it) |
| `tests/visual/identical.spec.ts` | `SPLIT_OWNED_RECIPE_NAMES` gains both boot recipes |
| `docs/testing/{e2e,visual}/running-tests.md` | project rows (doc-practice, same commit) |
| `tests/visual/goldens/<vp>/1{3,4}-boot-*.png` | deleted after the copies are verified |

## Objective

The boot sequence and boot state live in `src/features/boot/`, moved verbatim, with `boot.spec.ts`, `cold-boot.spec.ts`, the unit test, and both boot goldens green at both viewports with zero churn; `cold-boot.spec.ts`'s genuine unskipped-boot path still exercised; and a `boot-harness` route mounting `BootSequence` with no Terminal kernel.

## Background — verified inventory

Every path below was verified on disk. **Do not re-derive; do verify before editing.**

### Move table

| from | to | lines |
|---|---|---|
| `src/components/BootSequence.svelte` | `src/features/boot/components/BootSequence.svelte` | 420 |
| `src/lib/boot.ts` | `src/features/boot/lib/boot.ts` | 148 |
| `src/lib/bootState.ts` | `src/features/boot/lib/boot-state.ts` (D15 kebab-case) | 38 |
| `src/content/boot/log.md` | `src/features/boot/content/log.md` | 1 file |
| `src/data/boot.yaml` | `src/features/boot/content/boot.yaml` | 157 |
| `tests/e2e/boot.spec.ts` | `src/features/boot/tests/ui/e2e/boot.spec.ts` | 319 |
| `tests/e2e/cold-boot.spec.ts` | `src/features/boot/tests/ui/e2e/cold-boot.spec.ts` | 103 |
| `tests/unit/boot.test.ts` | `src/features/boot/tests/unit/boot.test.ts` | 213 |
| `tests/visual/goldens/<vp>/13-boot-mid.png` | `src/features/boot/tests/ui/visual/goldens/<vp>/` | 2 files |
| `tests/visual/goldens/<vp>/14-boot-ready.png` | `src/features/boot/tests/ui/visual/goldens/<vp>/` | 2 files |

**Not boot's, despite the name — do not touch:** `src/bootstrap/` is the Terminal kernel bootstrap (a different concept that merely shares the word), and `src/features/help/content/boot.md` is help's copy *about* booting.

### Orchestrator rulings (do not re-litigate — architecture R003)

- **R1 — `pipeline.mjs`'s storage-key import is declared, mandatory, and easy to miss.** `common/tests/ui/support/pipeline.mjs:42` reads `import { BOOT_SEEN_STORAGE_KEY } from "../../../../src/lib/bootState.ts";`. It must be repointed **in the same change as the move**. `pipeline.mjs` runs under bare Node, so its import **keeps the explicit `.ts` extension** — D23(d): Node's ESM resolver requires it, and that is not an R014 violation. Neither phase 03 nor 04 hit this edge (neither moved a storage-key module), so there is no prior instance to copy; get it right here. If it is missed, every visual golden capture breaks at once.
- **R2 — `buildBoot` stays in `src/common/lib/data.ts`.** It lives at lines 500–589 and is called by all six `src/pages/*.astro` files. The shared data layer is common's, not boot's — identical to how `buildProfile`/`buildHelp` stayed put in phases 03/04. Only the `?raw` yaml import at line 29 (registered in the `RAW` map at line 44) is repointed. **No page file is edited by this phase.**
- **R3 — no fixture switch.** D7's fixture-split mapping names only repositories, employment, dashboard, grep and shell-fs. Boot is absent, so `content.config.ts` gets a plain `base:` re-point with **no** `useFixtures` ternary and `build:fixtures` gains **no** new `cp` clause.
- **R4 — the two boot-adjacent notification specs stay in `legacy` this phase.** `tests/e2e/notifications-boot.spec.ts` and `tests/e2e/toast-drain-arm.spec.ts` import `BOOT_SEEN_STORAGE_KEY` but primarily test notification/toast behavior, so they belong to phase 06 and relocate there. This phase gives each a **path-only** import update in place. Do not move them.
- **R5 — no library-swap step.** Nothing in `00-phases.md` gives this phase an analog of phase 04's D11 fuzzysort step. This is the 5-step loop plus the harness, and nothing else.
- **R6 — fix four stale comments in the same change** (precedent: commit `57287a1`). (a) `cold-boot.spec.ts`'s header cites a shared fixture at `tests/e2e/fixtures.ts`, which does not exist — the real path is `common/tests/ui/support/fixtures.ts`. (b) `src/lib/boot.ts` carries a comment citing `src/lib/vim.ts` / `src/lib/pasteBuffer.ts`, both long since relocated to `src/common/engines/vim/vim.ts` and `src/common/lib/paste-buffer.ts`. (c) `boot.spec.ts:25` and (d) `cold-boot.spec.ts:24` both cite `src/data/boot.yaml`, which this phase moves to `src/features/boot/content/boot.yaml`. Comment text only — zero behavior change. **Note on (c)/(d):** both specs deliberately *hand-mirror* `bootMs`/`phaseLabels` rather than importing them at runtime ("no runtime import", `boot.spec.ts:25`). That duplication is pre-existing and intentional — update the comment path, never convert the constants to an import.

### Boot's capture path is structurally different from every other feature's

**This is the part a copy-paste of phase 03/04 gets wrong.** `common/tests/ui/support/recipes.ts` defines a separate type at lines 213–219 — `BootRecipe` has **only** `name` and `clockOffsetMs`; it has no `actions` and no `check` field, and is not a `Recipe` with an extra field:

```ts
export interface BootRecipe {
  name: string;
  clockOffsetMs: number;
}
```

Both boot recipes live in the `bootRecipes` array (lines 232–250): `{ name: "13-boot-mid", clockOffsetMs: 2000 }` and `{ name: "14-boot-ready", clockOffsetMs: BOOT_HARD_STOP_MS + 10 + BOOT_OUT_MS + 200 }` (= 5630, since `BOOT_HARD_STOP_MS` = 4660 and `BOOT_OUT_MS` = 760).

They are captured by a **separate function**, `captureBootState()` (`pipeline.mjs` lines 293–337), not by a branch inside `captureState()`. Differences that matter:

- It calls `page.clock.install({ time: CLOCK_TIME })` and then **`page.clock.pauseAt(t0)` before `page.goto()`** — boot's `pct`/phase/log/handshake math reads exact elapsed milliseconds, and 27–61 ms of wall-clock jitter is fatal to determinism here (harmless for every other recipe).
- It replays **no actions** and runs **no `check`** — there are none to run.
- For `clockOffsetMs > BOOT_HARD_STOP_MS` it uses a **two-stage `pauseAt`**: first `t0 + BOOT_HARD_STOP_MS + 10` so `finish()`'s outro `setTimeout` is actually *scheduled*, then the final offset. `pauseAt()` only fires timers that already existed when it was called. `14-boot-ready` takes this path; `13-boot-mid` does not.
- It aborts `**/api.github.com/**` and passes **no `mask`** to `page.screenshot` (`captureState()` masks the SIGNAL row).
- It deliberately does **not** pre-seed `BOOT_SEEN_STORAGE_KEY` — the opposite of `captureState()` — because a boot golden's entire point is a genuine, unskipped boot. It *does* pre-seed `TOAST_SEED_STORAGE_KEY`, since `14-boot-ready` lands on the post-outro dashboard.

**Consequence for step 1:** before writing `src/features/boot/tests/ui/visual/identical.spec.ts`, read `tests/visual/identical.spec.ts` and find how it dispatches `bootRecipes` → `captureBootState()` versus ordinary recipes → `captureState()`. Carry that branch across verbatim. A boot visual spec built on the profile/help template will call the wrong capture function and produce non-deterministic goldens.

### Fixture-vs-raw import split (port behavior untouched)

Both of this phase's specs deliberately use **raw `@playwright/test`**, and each says so in its own header:

- `boot.spec.ts:20` — "every other spec's shared `context` fixture pre-seeds the boot-seen sessionStorage flag specifically so boot never runs during THEIR tests; this file exists to exercise the real thing."
- `cold-boot.spec.ts:21` — same reason.

Preserve that. Do **not** normalize either onto the shared fixture — doing so would silently skip the very boot they exist to test.

### Other verified facts

- `BootSequence.svelte` has exactly one importer: `src/bootstrap/Terminal.svelte:57`, used at line 975 as `<BootSequence bind:this={bootRef} {boot} {desktopMode} onReady={onBootReady} />`. Many other files *mention* it in comments only — do not mistake those for imports.
- `src/lib/boot.ts` importers: `BootSequence.svelte:60`, `tests/unit/boot.test.ts:20`, `tests/e2e/boot.spec.ts:22`.
- `src/lib/bootState.ts` importers: `BootSequence.svelte:61` plus the six out-of-context sites in the wiring table.
- `src/content/boot/` holds exactly one file, `log.md` (12 frontmatter `entries`). `boot.yaml` holds timing/tag data joined to it **by `id`**; `buildBoot` throws at build time on a mismatch in either direction (lines 581 and 586). A dropped or renamed file breaks the build loudly, not silently.
- `src/content.config.ts` lines 174–189 define the `boot` collection (`base: "src/content/boot"`), exported at line 197.
- `vitest.config.ts` already globs `src/features/*/tests/unit/**/*.test.ts`. **No `vitest.config.ts` change is needed.**
- v1 drift: **none boot-specific.** `bootState.ts`, `src/content/boot/`, `boot.yaml` and `cold-boot.spec.ts` are byte-identical to v1's working tree. The few differences in `BootSequence.svelte`, `boot.ts`, `boot.spec.ts` and `boot.test.ts` are consequences of *already-completed* v2 work (the `data.ts` → `common/lib/data.ts` move, the vim/paste-buffer relocations, the node:test → vitest switch). Nothing to reconcile.

## Mechanics (settled by phases 02–04; reuse verbatim, do not redesign — architecture R003)

**1. D21(a) snapshot paths.** The root `snapshotPathTemplate` stays `"tests/visual/goldens/{projectName}/{arg}{ext}"`. Every split visual project carries its **own** template with the viewport as a **literal**, never `{projectName}`.

**2. Project naming.** A Playwright project is 1:1 with one `use` config, so each tier emits **two** entries via `viewports.map(...)`. **There is no bare alias and no glob** — `--project=boot` and `--project="*-visual"` both error. Always the two explicit flags.

**3. The three project entries this phase adds** to `playwright.config.ts`, appended after the `help-harness` entry:

```ts
...viewports.map((viewport) => ({
  name: `boot-${viewport.name}`,
  testDir: "./src/features/boot/tests/ui/e2e",
  use: { ...devices["Desktop Chrome"], viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 },
})),
...viewports.map((viewport) => ({
  name: `boot-visual-${viewport.name}`,
  testDir: "./src/features/boot/tests/ui/visual",
  snapshotPathTemplate: `src/features/boot/tests/ui/visual/goldens/${viewport.name}/{arg}{ext}`,
  use: { ...devices["Desktop Chrome"], viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 },
})),
{
  name: "boot-harness",
  testDir: "./src/features/boot/tests/ui/harness",
  use: { ...devices["Desktop Chrome"], viewport: { width: viewports[0].width, height: viewports[0].height }, deviceScaleFactor: 1 },
},
```

**4. D24 harness route.** `src/pages/harness/[feature].astro` is one shared dynamic route gated by `if (process.env.PORTFOLIO_FIXTURES !== "1") return [];` in `getStaticPaths`. Add a `boot` entry to (a) the `getStaticPaths` array, (b) a `const boot = feature === "boot" ? buildBoot(await getCollection("boot")) : undefined;` line, (c) a conditional block mounting `BootSequence` directly with `client:load`. `BootSequence` is boot's own orchestrator component, so a wrapper is needed **only** if `onReady`/`bind:this` routing that `Terminal.svelte` normally owns must be reproduced — if so, put it at `src/features/boot/tests/ui/harness/BootHarness.svelte` (test support, never in the feature's real `components/`) and render `onReady`'s firing into a `data-testid` stand-in element rather than skipping the assertion.

**5. Harness hydration race — required.** Whenever the harness ships `client:load`, the server-rendered HTML exists before hydration, so a spec that waits on a content locator races the listener attaching. Render an `onMount`-flipped element and wait on **that**: `<div data-testid="boot-harness-ready" data-ready={ready}></div>`. Boot is time-driven, so the harness spec must also drive `page.clock` itself rather than waiting on wall-clock — mirror `captureBootState()`'s install-then-`pauseAt`-before-`goto` ordering.

**6. Page objects.** `src/features/boot/tests/ui/pages/BootPage.ts`, a sibling of `e2e/`/`visual/`/`harness/`. A feature page object **may not** redefine kernel-chrome locators — compose the shared class:

```ts
import { StatusBarPage } from "../../../../../../common/tests/ui/pages/StatusBarPage";
```

Verify that relative depth with `node -e "…path.relative…"`; do not guess it.

**7. Locators.** `playwright.md` R002 bans CSS selectors unconditionally, even scoped off a resolved testid. If a repeated element needs narrowing, add a real `data-testid` to the markup (attribute-only, zero pixel change, goldens re-verified in the same change — D24's sanctioned mechanical edit).

**8. Per-commit index self-consistency (toolchain R012).** If this phase's edits span multiple commits, run `pnpm generate` **per commit against that commit's own tree** (stash uncommitted files first) and diff `public/generated/{grep-index,fs-index}.json` **programmatically** — both are single-line JSON, so `git diff` alone is useless. Revert unrelated live-data drift (`contributions.json`, `commits/daily-tech-digest.json`, `file-icons.json`) with `git checkout --` before committing. Note `scripts/generate.mjs` walks only `["src","scripts","tests"]`, so files under `common/tests/` legitimately drop out of both indexes.

## Steps

- [x] **1. Port specs + goldens.**
  `git mv` both specs into `src/features/boot/tests/ui/e2e/`. They import raw `@playwright/test`, so there is no shared-fixture path to repoint — but fix each spec's `ROOT = join(import.meta.dirname, …)` constant to the new depth, and **strip `.ts` extensions** from their `src/lib/*` imports (D23(d): a feature phase's spec-port step MUST strip them). Verify depth with `path.relative`, never by counting by eye. Apply R6's `cold-boot.spec.ts` comment fix. Leave the `src/lib/boot*` import targets alone for now — step 2 moves those modules; they must be green at the end of step 2, not this one.
  Create `src/features/boot/tests/ui/visual/identical.spec.ts`, carrying across the `bootRecipes` → `captureBootState()` branch from `tests/visual/identical.spec.ts` (§Background) and filtering to a `BOOT_OWNED_RECIPE_NAMES` set of both recipes.
  `cp` all four goldens into `src/features/boot/tests/ui/visual/goldens/<vp>/`; `cmp` each against the pre-move copy **and** against v1's at `/Users/shev/Development/spidey-hub/tests/visual/goldens/`; then delete the originals. Add both recipe names to `tests/visual/identical.spec.ts`'s `SPLIT_OWNED_RECIPE_NAMES` and update its header comment.
  Add the three project entries (§Mechanics 3); extend `package.json`'s `test:e2e` with `--project=boot-1512x945 --project=boot-1920x1080` and `test:visual` with the new `identical.spec.ts` path **only**. The harness spec path is added in step 6, when the spec exists — Playwright exits 1 on a path that resolves to no tests, so adding it here reds this step's own gate. (The `boot-harness` *project entry* is fine to add now; an empty `testDir` is not an error, an unmatched spec path is.) Sweep `docs/testing/{e2e,visual}/running-tests.md` in this same commit: add rows matching the existing `common`/`profile`/`help` rows' shape exactly (concrete prose naming the real spec files), remove `boot` from the "remaining features" parenthetical in **both** files, and extend each header's "so far" list to include `boot`. **Verify every project name against real `playwright test --list` output before writing any row** — phase 03 shipped fabricated bare-alias rows twice.
  *Verify:* `pnpm build` then `E2E_EXPECT_FIXTURES=0 playwright test --project=smoke --project=legacy-1512x945 --project=legacy-1920x1080 --project=common-1512x945 --project=common-1920x1080 --project=profile-1512x945 --project=profile-1920x1080 --project=help-1512x945 --project=help-1920x1080 --project=boot-1512x945 --project=boot-1920x1080` → all green. Then `pnpm build:fixtures` and the `test:visual` spec list including the new `identical.spec.ts` → all green, both boot goldens matching. `playwright test --list` names all three new projects.

- [x] **2. Move source; update every importer; delete originals.**
  `git mv` `BootSequence.svelte`, `boot.ts`, `bootState.ts` → `lib/boot-state.ts`, `log.md`, and `boot.yaml` per the move table. Apply R6's `boot.ts` comment fix.
  Repoint **every** importer in §Context's wiring table. Work down that table literally and tick each one off — `pipeline.mjs:42` (R1, keeps its `.ts` extension) is the one that silently breaks all visual capture if missed.
  Update `content.config.ts`'s `base:` to `src/features/boot/content` (no fixture switch — R3) and `src/common/lib/data.ts:29`'s `?raw` import (R2 — `buildBoot` itself does not move, and no page file is touched).
  `pnpm generate`; diff both indexes programmatically.
  *Verify:*
  ```bash
  test ! -e src/components/BootSequence.svelte
  test ! -e src/lib/boot.ts && test ! -e src/lib/bootState.ts
  test ! -d src/content/boot && test ! -e src/data/boot.yaml
  grep -rn "lib/boot\b\|lib/bootState\|components/BootSequence\|data/boot\.yaml\|content/boot" src tests common scripts
  ```
  The grep must return **only** intentionally-updated lines — no stale residue. Comment-only mentions of `BootSequence.svelte` in other files are expected and are not stale imports; leave them unless R6 names them. Record every legacy→feature edge in Results for the auditor, naming the D23(c) exemption.

- [x] **3. Full gate, from the clean committed tree.** Not folded into step 2's commit.
  *Verify:* `pnpm check` → 0 errors. `pnpm lint` → exit 0. `pnpm test:unit` → count unchanged from before this phase. D20 (a) real build → every project above green. D20 (b) fixture build → every `*-visual` + legacy visual + the **two existing** harness specs (`profile`, `help`) green. Boot's own harness does not exist yet — it lands in step 6 and is gated there. `public/generated/*` unchanged by this step. These runs auto-background past the 120s foreground default — monitor to completion, never sleep-poll.

- [x] **4. Golden parity — zero churn.**
  *Verify:* `diff -rq tests/visual/goldens /Users/shev/Development/spidey-hub/tests/visual/goldens` shows **only** `Only in …` lines for every recipe split out by phases 02–05 — never a `differ` line. `cmp` each of this phase's four goldens against v1's byte-for-byte. Total PNGs stay 21 recipes × 2 viewports = 42, redistributed. **No `--update-snapshots`, ever (D5).**

- [x] **5. Move the unit test.**
  `git mv tests/unit/boot.test.ts src/features/boot/tests/unit/boot.test.ts`; fix its `src/lib/boot` import and its `src/common/lib/data` type import to the new depths.
  *Verify:* `pnpm test:unit` → same N/N passed, same M/M files as before (pure relocation).

- [x] **6. Feature harness (D24).**
  Add the `boot` branch to `src/pages/harness/[feature].astro` (§Mechanics 4), the ready-element and clock control (§Mechanics 5), and a spec at `src/features/boot/tests/ui/harness/boot.spec.ts` asserting mount plus boot's core behavior — the sequence runs and reaches ready under driven clock time, with phase/progress advancing. Assert kernel-free isolation via the composed `StatusBarPage`: `expect(boot.statusBar.windows).toHaveCount(0)`. No goldens (D24(b)).
  Now that the spec exists, append its path to `package.json`'s `test:visual` (deferred from step 1).
  *Verify:* fixture build → `--project=boot-harness` green, and `pnpm test:visual` green as a whole with the new path in it. Real build → `test ! -d dist/harness` **and** `grep -rl "BootHarness" dist --include="*.html"` empty. A bare `find dist -iname "*harness*"` will still match a dead ~1 KB JS chunk if a wrapper component was used — that is expected and ruled harmless (`00-phases.md`, Deferred), **not** a failure.

- [x] **7. Record and close.** Fill in Results: every file moved, every importer updated (the wiring table ticked off one by one), the D23 edges flagged for the auditor, gate outputs, and which harness shape was used. Commit to `frontend-rewrite` — single-line imperative, **no body, no trailer** (toolchain R011), one reviewable unit per commit (R012).
  **Also correct one stale claim in `Instructions/00-phases.md`'s status line in this same edit:** it reads "77 local commits on `frontend-rewrite`, nothing pushed." `origin/frontend-rewrite` is in fact at the same SHA as local `HEAD` (verified with `git ls-remote --heads origin`), so the branch **is** pushed. Re-verify with `git ls-remote` before writing, then state the true position and update the commit count. This corrects the record only — **do not push anything** in this phase.

## Acceptance criteria

1. Every file in the move table is at its new path; `src/components/BootSequence.svelte`, `src/lib/boot.ts`, `src/lib/bootState.ts`, `src/content/boot/` and `src/data/boot.yaml` no longer exist.
2. Every importer in the wiring table resolves — in particular `pipeline.mjs:42`, verified by visual capture still working, not by inspection alone.
3. `pnpm check` 0 errors, `pnpm lint` 0 findings, `pnpm test:unit` count unchanged.
4. D20 both invocations green, including `boot-{1512x945,1920x1080}`, `boot-visual-*`, and `boot-harness`.
5. Zero golden churn; 42 PNGs total; `13-boot-mid` and `14-boot-ready` byte-identical to v1 at both viewports.
6. Both specs still import raw `@playwright/test` and still exercise a genuine unskipped boot.
7. Real build emits no `dist/harness/` directory and no HTML reference to a harness component.
8. Verifier PASS **and** auditor clean on `src/features/boot` (D23 exemptions recorded with the exemption named).
9. Results filled in; no `(executor fills in)` placeholder.

## Stop conditions

- **No boot-timing or behavior changes.** Not `bootMs`, not the hard-stop slack, not the outro hold, not the phase formulas. If a golden goes red, the move is wrong — never the golden.
- **No rewriting moved code**, no splitting `BootSequence.svelte` (files-and-naming R002/R010/R012 on a relocated single-file view is a recorded D23(e) exemption, not a task), no normalizing either spec onto the shared fixture.
- **No golden regeneration**, no `--update-snapshots`.
- **Do not move** `notifications-boot.spec.ts` or `toast-drain-arm.spec.ts` (R4) — path-only updates.
- **No behavioral edits outside the context** — path and comment updates only.
- If a step turns out to rest on a false assumption, **stop and report** rather than redesigning; the orchestrator updates this plan.

## Results

**Status: all 7 steps complete, verifier PASS (twice), both auditor fix rounds complete, all gates green. Phase closed.** Eleven commits on `frontend-rewrite`:
1. `47c75cd` — Port boot's e2e/visual specs and goldens into src/features/boot
2. `82fa00d` — Move boot's source and content into src/features/boot, repointing every importer
3. `e30b05e` — Move boot's unit test into src/features/boot
4. `d9dec83` — Add boot's feature harness route, page object, and spec
5. `edff902` — Record phase 05 results and correct the phases index push-status claim
6. `5f02a1b` — Fix self-referential commit count and e2e-doc visual-row asymmetry
7. `82b2bc9` — Fix BootPage member order, locator, and wait-naming audit findings
8. `42ecd81` — Rewrite cold-boot.spec.ts header without a v1 plan-doc reference
9. `12c39ec` — Add missing unit tests for boot-state.ts
10. `401044d` — Record phase 05 auditor fix-round results
11. `c4c432d` — Add BootPage banner comments and drop cold-boot.spec.ts's second plan reference

### Auditor fix round (5 genuine findings ruled in-scope; 5 fixed, 0 remaining)
The auditor found 21 violations total (9 already D23-exempt, 12 flagged genuine of which the orchestrator ruled 7 exempt — recorded by the orchestrator directly in `Instructions/00-phases.md`'s D23 clause — and 5 required fixes). All 5 fixed:

1. **`classes.md` R011 (member ordering), `BootPage.ts`** — reordered to constructor → getters (`bootSequence`/`bootOutro`/`pct`/`phase`) → behavior methods (`openHarnessAndAwaitBootRunning`/`advanceTo`). Pure reordering, no logic change. Commit `82b2bc9`.
2. **`playwright.md` R002/R003/R005 + `e2e-testing.md` R003, `boot.spec.ts` (harness)** — the `page.evaluate()`/`document.querySelector()` triple-read was replaced with a plain `getAttribute()` call on `boot.bootSequence` (a testid-based locator, not CSS) to derive the expected pct/phase, followed by web-first `expect(boot.pct).toHaveText(...)`/`expect(boot.phase).toHaveText(...)` assertions through the page object. No CSS selectors remain in this file. Commit `82b2bc9`.
3. **`e2e-testing.md` R007, `BootPage.openHarness()`** — renamed to `openHarnessAndAwaitBootRunning()` (option: state the outcome in the name), keeping the `expect(...).toHaveAttribute(...)` implementation: a CSS-free equivalent of the ported `freshBoot()`'s combined `[data-testid=…][data-boot-running=…]` `.waitFor()` doesn't exist without reintroducing a banned selector (R002 applies to authored code, unlike the exempt ported spec), so the assertion-based wait was kept and the method renamed instead, per the fix's own second acceptable option. Commit `82b2bc9`.
4. **`comments.md` R008, `cold-boot.spec.ts` header** — rewrote the "PLAN.md Phase 7.2"/"PLAN.md F1's defect 1" references to describe the spec's own coverage in its own terms (still-untested surfaces, the bell/senseRing ring regression fixed by commit `b885c18`), with no v1 plan/phase identifiers. Comment text only. Commit `42ecd81`.
5. **`unit-testing.md` R002/R003, missing `boot-state.ts` coverage** — added `src/features/boot/tests/unit/boot-state.test.ts` (7 tests): the SSR/undefined-`sessionStorage` path (both functions), the throwing-storage path (both functions), the mark→has round trip, the exact storage key written, and the "any value other than the literal `\"1\"` reads as not-played" edge. `boot-state.ts` itself untouched (additive only). Followed `tests/unit/notificationStore.test.ts`'s `withLocalStorage`-stub convention, adapted for `sessionStorage` — Node's own built-in `sessionStorage` global (confirmed present in this Node 26 runtime) is never relied on; every test installs/removes its own explicit stub via `globalThis` and restores the original property descriptor in `afterEach`, so the suite is deterministic regardless of Node version/environment. Commit `12c39ec`.

Also fixed, not part of the 5 but caught by the advisor before the phase-05 record was final: a self-referential commit count in `Instructions/00-phases.md` (corrected in `5f02a1b`, phrased to name itself so it can't go stale the same way), and an asymmetric `boot-visual-*` row that had leaked into `docs/testing/e2e/running-tests.md` (removed in the same commit — visual rows live only in the visual doc, matching common/profile/help).

**Not touched, per the coordinator's explicit instruction:** `Instructions/00-phases.md`'s D23 clause itself — the orchestrator is recording the three new/extended rulings (playwright.md R007–R011 scope clarification for D23(a); files-and-naming R013 batching exemption extending D23(e); the new "visual-coverage gaps are a rebaseline decision" Deferred item) there directly.

### Re-verification after the fix round
- `pnpm check` → 0 errors (123 files checked, up from 122 — the new unit test file).
- `pnpm lint` → exit 0.
- `pnpm test:unit` → **346 passed, 20 files** (up from 339/19 — the 7 new `boot-state.test.ts` tests; this increase is expected and correct, not a regression signal).
- D20(a) real build → `1012 passed` (unchanged from before the fix round — none of the 5 fixes touch e2e-project-visible behavior).
- D20(b) fixture build → `65 passed` (`--project=boot-harness` re-run 3× clean beforehand to confirm the rewritten web-first assertions introduce no flake).
- Golden churn: `diff -rq` against v1 → only `Only in …` lines, zero `differ` lines; all 4 boot goldens still byte-identical to v1. 42 PNGs total, unchanged.
- Per-commit index discipline: each of the three fix commits was generated and diffed against its own tree in isolation (uncommitted later changes stashed first, per Mechanics 8), confirming each commit's `fs-index.json`/`grep-index.json` delta contains only that commit's own edited/added files. Live-data drift (`contributions.json`, `commits/daily-tech-digest.json`, `file-icons.json`) reverted before every commit.

### Files moved (move table, all confirmed gone from old paths)
- `src/components/BootSequence.svelte` → `src/features/boot/components/BootSequence.svelte`
- `src/lib/boot.ts` → `src/features/boot/lib/boot.ts`
- `src/lib/bootState.ts` → `src/features/boot/lib/boot-state.ts` (D15 kebab-case)
- `src/content/boot/log.md` → `src/features/boot/content/log.md`
- `src/data/boot.yaml` → `src/features/boot/content/boot.yaml`
- `tests/e2e/boot.spec.ts` → `src/features/boot/tests/ui/e2e/boot.spec.ts`
- `tests/e2e/cold-boot.spec.ts` → `src/features/boot/tests/ui/e2e/cold-boot.spec.ts`
- `tests/unit/boot.test.ts` → `src/features/boot/tests/unit/boot.test.ts`
- `tests/visual/goldens/<vp>/{13-boot-mid,14-boot-ready}.png` (×2 viewports) → `src/features/boot/tests/ui/visual/goldens/<vp>/` — byte-identical to both the pre-move copy and v1's originals (`cmp` verified both ways before deletion, and again in step 4).

New (not a move): `src/features/boot/tests/ui/visual/identical.spec.ts`, `src/features/boot/tests/ui/pages/BootPage.ts`, `src/features/boot/tests/ui/harness/boot.spec.ts`.

### Every importer in the wiring table, ticked off
| site | status |
|---|---|
| `playwright.config.ts` | 3 project entries added verbatim per §Mechanics 3 |
| `package.json` | `test:e2e`/`test:visual` extended (harness path added in step 6, per plan) |
| `src/content.config.ts` | `boot` collection `base:` → `src/features/boot/content` (plain string, no fixture switch — R3 confirmed) |
| `src/common/lib/data.ts:29` | `bootRaw` `?raw` import re-pointed; `buildBoot` itself untouched (R2) |
| `src/pages/harness/[feature].astro` | `boot` branch added in step 6 (getStaticPaths, `buildBoot` call, direct `<BootSequence>` mount) |
| `src/bootstrap/Terminal.svelte:57` | import re-pointed to `../features/boot/components/BootSequence.svelte` |
| `common/tests/ui/support/pipeline.mjs:42` (**R1**) | re-pointed, **`.ts` extension kept** (bare-Node ESM) — verified green via the boot-visual gate (real capture, not inspection) |
| `common/tests/ui/support/fixtures.ts:40` | re-pointed, extensionless (existing style preserved) |
| `common/tests/ui/e2e/animations.spec.ts:26` | re-pointed, extensionless |
| `tests/visual/adversarial-fixtures.spec.ts:24` | re-pointed, **`.ts` kept** (legacy D23(d) exemption — file stays un-ported) |
| `tests/e2e/notifications-boot.spec.ts:19` (R4) | path-only, **`.ts` kept**; file stays in `legacy`, comments untouched |
| `tests/e2e/toast-drain-arm.spec.ts:33` (R4) | path-only, **`.ts` kept**; file stays in `legacy`, comments untouched |
| `tests/visual/identical.spec.ts` | `SPLIT_OWNED_RECIPE_NAMES` gained both boot recipes; header comment updated |
| `docs/testing/{e2e,visual}/running-tests.md` | rows added matching common/profile/help shape, verified against real `playwright test --list` output before writing; "so far" lists and "remaining features" parentheticals updated in both files |
| `tests/visual/goldens/<vp>/1{3,4}-boot-*.png` | deleted after byte-identical copies verified |

### Plan gaps found during execution (all fixed; none required redesigning the plan)
1. **`SPLIT_OWNED_RECIPE_NAMES` alone doesn't stop the root spec from re-capturing boot's recipes.** `tests/visual/identical.spec.ts`'s boot describe block iterates `bootRecipes` unfiltered — the set only ever filtered `keyRecipes`. Since step 1 deletes the root goldens, the unfiltered loop would have failed on missing snapshots. Fixed in the same step-1 commit by filtering the boot loop too (`bootRecipes.filter((r) => !SPLIT_OWNED_RECIPE_NAMES.has(r.name))`), mechanically consistent with the plan's stated "every recipe captured exactly once" intent.
2. **Two `BOOT_SEEN_STORAGE_KEY` importers outside the declared wiring table:** `scripts/capture-screenshots.mjs:24` and `scripts/generate-design-mirror.mjs:47` (bare-Node `.mjs`, `.ts`-extension imports, same D23(d) shape as `pipeline.mjs`/R1). Neither is exercised by any phase gate (standalone doc/design-mirror tooling), so nothing would have caught the breakage, but leaving them would have silently regressed two working scripts. Repointed in step 2 alongside the declared six.
3. **Step 2/step 3/step 5 sequencing gap:** `tests/unit/boot.test.ts` (listed in Background as one of `boot.ts`'s three importers, not moved until step 5) imports `../../src/lib/boot`, which step 2 relocates. Step 3's gate (`pnpm check` 0 errors, `pnpm test:unit` full pass) sits between steps 2 and 5 and would have failed on this dangling import. Fixed by repointing the import string (`../../src/features/boot/lib/boot`, extensionless, path only — no physical move, no comment fixes) in step 2's own commit; the physical `git mv` plus header-comment fixes (citing `src/lib/boot.ts`) still happened in step 5 as planned, keeping each commit one reviewable unit.
4. **`boot.ts`'s own internal import was stale after its move** (`../common/lib/data` → needed `../../../common/lib/data`) — caught by `pnpm check` in step 2's own verification pass (a `import type` line, so it didn't fail `pnpm build`, only `tsc`); fixed before the step-2 commit.
5. **R6(b) was already correct on disk** — `src/lib/boot.ts`'s header already cited the current paths (`src/common/engines/vim/vim.ts`, `src/common/lib/paste-buffer.ts`), contrary to the plan's claim of a stale `src/lib/vim.ts`/`src/lib/pasteBuffer.ts` reference. No edit made; recorded here per the plan's own "record the stale plan claim" instruction.
6. **No `ROOT = join(import.meta.dirname, …)` constant exists in either ported spec** (`boot.spec.ts`/`cold-boot.spec.ts`) — both import raw `@playwright/test` with no path-joining helper. No-op; the plan's instruction to fix such a constant didn't apply. Import-depth fixes (verified via `node -e path.relative`, never by eye) were still required and applied (step 1: to the still-legacy `src/lib/boot`/`bootState` targets; step 2: repointed again to the new in-feature location).
7. **`boot.yaml` itself (a moved, in-context file) carried stale path comments** matching step 2's grep patterns (`src/content/boot/log.md`, `src/lib/boot.ts` ×3) — not named in R6's four-item list, but fixed in step 2 under the same "moved file, grep-matching comment" rule R6(c)/(d) exemplify, since leaving them would have been inconsistent with the step's own "no stale residue" gate philosophy.

### Comment residue left deliberately (out-of-context, not R6-named — classified, not stale imports)
- `src/common/lib/data.ts:500,581,586` — `buildBoot`'s own section comment/error strings still say `src/content/boot`; R2 keeps `buildBoot` and its file untouched beyond the one `?raw` import line.
- `src/common/lib/clock.ts:55`, `src/lib/notificationStore.ts:126` — comment mentions of `src/lib/bootState.ts`; out-of-context, not in the wiring table, not R6-named.
- `common/tests/ui/support/pipeline.mjs:123,307`, `common/tests/ui/support/fixtures.ts:5,61`, `common/tests/ui/support/recipes.ts:221,238` — comment mentions of old boot paths in files whose only authorized edit was the declared import repoint.
- `tests/visual/adversarial-fixtures.spec.ts:35`, `tests/e2e/notifications-boot.spec.ts:4,22` — comment mentions in files under R4's/D23(d)'s path-only exemption.
All of the above resolve as **plain string matches only** — no broken imports remain anywhere in the repo (confirmed by the step-2 and step-5 grep sweeps: every `import`/`from` line in the residue list above already points at the new path).

### D23 exemption edges for the auditor
- **D23(c) legacy→feature import edges** (pre-existing dependency direction, path-only update during the move — not a new violation): `common/tests/ui/support/{pipeline.mjs,fixtures.ts}`, `common/tests/ui/e2e/animations.spec.ts`, `tests/visual/adversarial-fixtures.spec.ts`, `tests/e2e/{notifications-boot.spec.ts,toast-drain-arm.spec.ts}`, `scripts/{capture-screenshots.mjs,generate-design-mirror.mjs}` (the two undeclared ones found above) → all import `BOOT_SEEN_STORAGE_KEY` from `src/features/boot/lib/boot-state.ts`. Also `tests/unit/boot.test.ts` → `src/features/boot/lib/boot` for the span between step 2's commit and step 5's commit (self-closed: step 5's commit physically relocated the file into context, so this edge no longer exists in the closed tree).
- **D23(d) `.ts`-extension exemption** (bare-Node ESM resolver requirement, not an R014 violation): `pipeline.mjs`, `adversarial-fixtures.spec.ts`, `notifications-boot.spec.ts`, `toast-drain-arm.spec.ts` all keep explicit `.ts` extensions on their `BOOT_SEEN_STORAGE_KEY` import — same shape as the two scripts above.
- **D23(a)** — both ported specs (`boot.spec.ts`, `cold-boot.spec.ts`) keep raw CSS-selector-shaped locator strings (`'[data-testid="..."]'` constants) rather than page-object getters; verbatim-ported specs, exempt.
- **D23(e)** — `BootSequence.svelte` (420 lines) relocated as a single-file view, un-split; recorded exemption, not a task, per the move-don't-rewrite stop condition.
- No new architecture R008/R009 edges: the harness route's direct `<BootSequence>` mount is D24's sanctioned design, already covered by the phase-03 ruling.

### Gate outputs (verbatim summary; full logs were monitored to completion, never sleep-polled)
- Step 1 verify: `pnpm build` real build → `1012 passed` (2 runs; first run flagged a build/generate-timing self-inflicted staleness on unrelated `repositories.spec.ts` commit-SHA assertions — root-caused to running `pnpm generate` after building `dist/` without rebuilding, fixed by rebuilding immediately before the gate; not a boot regression). Fixture build → `test:visual` list (7 specs) → `60 passed`, both boot goldens matching at both viewports. `playwright test --list` confirmed all three new project names (`boot-{1512x945,1920x1080}`, `boot-visual-{1512x945,1920x1080}`, `boot-harness`) resolve.
- Step 2 verify: `test !-e`/`test !-d` checks all passed; grep swept and every residual match classified (see above); `pnpm generate` diffed programmatically both times (path-only entries for the 5 moved files + size deltas for every edited importer, nothing else).
- Step 3 (full gate, fresh committed tree): `pnpm check` → 0 errors / 0 warnings-as-errors (10 warnings, pre-existing, unrelated). `pnpm lint` → exit 0. `pnpm test:unit` → 339 passed, 19 files (confirmed unchanged via `git stash` re-run). D20(a) real build → `1012 passed`. D20(b) fixture build → `60 passed`. `public/generated/*` unchanged after live-data-drift revert.
- Step 4: `diff -rq` against v1 goldens → only `Only in …` lines (9 recipes now split out across phases 02–05, including both boot recipes), zero `differ` lines. `cmp` on all 4 boot goldens → byte-identical to v1. Total PNG count: 42.
- Step 5: `pnpm test:unit` → 339 passed, 19 files (unchanged). `pnpm check` → 0 errors.
- Step 6: `--project=boot-harness` → `5 passed`, re-run 3× clean (no flake, despite the `pauseAt` real-time-resumes-after-control-call hazard `boot.spec.ts` documents — mitigated by reading `data-elapsed` back rather than assuming an exact offset lands). Full `test:visual` (9 specs) → `65 passed`. Real build → `test ! -d dist/harness` true; `grep -rl "BootHarness" dist --include="*.html"` empty; bare `find dist -iname "*harness*"` found only the pre-existing `HelpHarness.*.js` dead chunk from phase 04 — **no boot-side dead chunk at all**, since the harness mounts `BootSequence` directly with no wrapper component.

### Harness shape decision
**Direct `<BootSequence client:load {boot} desktopMode={true} />` mount, no wrapper** — consulted the advisor before committing to this in step 6. `onReady`/`bind:this` (Terminal.svelte's own routing) are never asserted by the harness spec, and "reached ready" is observable as the whole overlay unmounting (`{#if booting}`), so Mechanics 4's wrapper condition ("only if `onReady`/`bind:this` routing... must be reproduced") was never triggered. For Mechanics 5's hydration-race "ready element," reused BootSequence's own existing `[data-testid="boot-sequence"][data-boot-running="true"]` marker (flips synchronously inside `run()`, client-side only) rather than adding a new wrapper-only testid — it already serves the identical purpose `captureBootState()` relies on. `BootPage.ts` owns the fake-clock protocol (`clock.install()` → `clock.pauseAt(t0)` **before** `page.goto()`, then an `advanceTo()` helper encapsulating the two-stage-past-hard-stop `pauseAt` rule) — mirrors `captureBootState()`'s ordering exactly, per the plan's explicit instruction, rather than the simpler `clock.runFor()` pattern `boot.spec.ts`'s own e2e suite uses (which the advisor flagged as introducing real-time-resumes-after-control-call jitter `pauseAt` avoids). `desktopMode={true}` is required and easy to miss: the component's own `$effect` gates `run()` on it.

### Notes
- `Instructions/00-phases.md`'s stale "77 local commits, nothing pushed" status line corrected to reflect verified reality (`git ls-remote --heads origin frontend-rewrite`, origin at `57287a1`). First correction attempt (commit `edff902`) stated a count that its own commit immediately invalidated (self-reference bug caught by the advisor); fixed in a follow-up commit with the count taken *after* that commit landed, phrased to name itself explicitly so it can't silently go stale the same way again. Final state: 85 local commits, 8 ahead of origin, nothing pushed by this phase.
- `docs/testing/e2e/running-tests.md` briefly gained a `boot-visual-*` row that `common`/`profile`/`help` don't carry there (their visual rows live only in `docs/testing/visual/running-tests.md`) — an asymmetry the advisor flagged before this phase closed. Removed in the same follow-up commit; the e2e doc now matches the established per-feature shape exactly, and `boot-visual-*` is documented only in the visual doc.
- Verifier PASS was confirmed twice (1012 e2e / 65 visual / `boot-harness` stable across repeated runs both times, zero golden churn both times). The auditor's first re-audit found 21 violations (9 already D23-exempt, 12 genuine of which the orchestrator ruled 7 exempt — recorded directly in `Instructions/00-phases.md`'s D23 clause — and 5 required fixes, all addressed in commits `82b2bc9`/`42ecd81`/`12c39ec`). A second re-audit found the first round's 2 comment/structure fixes only partially complete (see below); both now fully closed.

### Second auditor fix round (2 partial findings, both closed)
1. **`classes.md` R011, second clause — `BootPage.ts`.** Member *ordering* (fixed in round one) was correct, but the rule also requires a short banner comment grouping getters separately from behavior methods when a class has both. Checked `common/tests/ui/pages/TerminalPage.ts` and `src/features/help/tests/ui/pages/HelpPage.ts` first, per instruction — neither uses a banner convention (both just rely on member order plus per-member doc comments), so no existing style to match; added the minimal `// --- getters ---` / `// --- behavior methods ---` form as directed. Structure-only, zero logic change.
2. **`comments.md` R008 — second `cold-boot.spec.ts` plan reference.** The header rewrite (round one) was clean, but a second citation survived in the file body at the animation-check comment: `(PLAN.md F1)`. Rewrote in the spec's own terms — `getComputedStyle().animationName` reports a dead keyframe reference exactly like a live one because it returns the declared name regardless of whether it resolves to a registered `@keyframes` rule (the same insight `common/tests/ui/e2e/animations.spec.ts`'s own header already explains, cited instead of the external plan). Comment text only — confirmed via `git diff` that no assertion, locator, or test logic changed; the `BOOT_SEQUENCE`/`BELL`/`SENSE_RING` raw-selector constants and `terminalReady()` (both triaged D23(a) ported-spec exemptions) were untouched.

Swept all of `src/features/boot/` afterward for any remaining `PLAN.md`/`Phase N`/`F<n>`/`G<n>`-style plan citations (`grep -rniE "plan\.md|defect [0-9]|phase [0-9]|\bf[0-9]+('s)?\b|\bg[0-9]+('s)?\b"`): zero hits. Nothing else to fix.

**Re-verification after the second fix round:** `pnpm check` → 0 errors (123 files). `pnpm lint` → exit 0. `pnpm test:unit` → 346 passed, 20 files (unchanged, as expected — no test logic touched). `dist/index.html` checked for `data-fixture-mode="true"` before running the harness gate (per the coordinator's environment note about a concurrent build); confirmed fresh. `--project=boot-harness` → 5 passed. Full D20 suite not re-run, per the coordinator's instruction (comment-only edits, verifier already proved it green at `401044d`).

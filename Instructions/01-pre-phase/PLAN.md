# Phase 01 — pre-phase

> **Status: planned, not started.** Contract for this phase's executor. Binding decisions: `Instructions/00-phases.md` (read it first — D-numbers below refer to it).

## Context

Out of context: root config, `docs/`, the bulk-imported legacy tree, `tests/`, `common/tests/ui/support/` (shared-fixture scaffold, per the skill's pre-phase charter). This is `Instructions/Planning/test-setup.md`'s Phase 0.

## Objective

A byte-parity-verified, fully green copy of v1 running inside this repo, with the v2 toolchain (settled tsconfig flags, Vitest, oxlint), a restructured Playwright config (`legacy` + `smoke`), and the recipe→feature golden map that every later phase seeds from.

## Background

- v1 = `/Users/shev/Development/spidey-hub` working tree as-is (uncommitted changes included). Read-only except files its own scripts write (`public/generated/`, `src/generated/`, `dist/`).
- v1 facts: pnpm@11.20.0, all deps exact-pinned, `@playwright/test 1.62.1` (never change — toolchain R002), 30 e2e specs + `fixtures.ts`/`contentFixtures.ts`, 19 unit tests on `node --test`, 21 goldens × 2 viewports (`1512x945`, `1920x1080`) captured by `tests/visual/capture-goldens.mjs` and compared by `identical.spec.ts`/`adversarial-fixtures.spec.ts` via `toMatchSnapshot`, `snapshotPathTemplate: tests/visual/goldens/{projectName}/{arg}{ext}`.
- Assumption to test, not build on: v1 is green on this machine (step 1 tests it — nothing ever has).

## Steps

- [x] **1. v1 pre-flight.** Snapshot `git -C <v1> status --porcelain tests/visual/goldens`. Then run, one at a time, capturing exit codes: `pnpm check`, `pnpm test:unit`, `pnpm test:e2e`, `pnpm test:visual` (in v1; `pnpm install` first if needed; never `--update-snapshots`). Re-snapshot goldens status — must be unchanged. **If any suite is red, STOP and report per-suite results — do not fix v1, do not proceed.**
  *Verify:* four exit codes recorded in this file under Results; goldens diff empty.
- [x] **2. Docs alignment.** toolchain.md R014: remove "*(open)*", record D2's settled convention. Sweep `node --test` → Vitest in `docs/checklist/testing/README.md` R001 and `docs/testing/e2e/structure.md` (runner name only).
  *Verify:* `grep -rn "node --test" docs/` empty; R014 contains both flag names and "extensionless".
- [x] **3. Bulk import.** Copy v1 working tree verbatim: `src/`, `scripts/`, `tests/`, `fixtures/`, `public/` (**including `public/generated/`** — generate.mjs's keep-existing-on-failure fallback needs it), `package.json`, `pnpm-workspace.yaml`, `astro.config.mjs`, `tsconfig.json`, `playwright.config.ts`, the 8 `repos/` submodules (git is live on `frontend-rewrite` — add them properly: `git submodule add <url> repos/<name>` per v1's `.gitmodules`, pinned to the same commit SHAs v1 has checked out — read each with `git -C <v1>/repos/<name> rev-parse HEAD`). Exclude `node_modules`, `dist`, `.git`, `.astro`. Note: v2's empty `src/content/` gets replaced by v1's. Then `pnpm install`, `node scripts/generate.mjs`.
  *Verify:* `pnpm check` exits 0; `pnpm build` exits 0.
- [x] **4. Baseline suites.** `pnpm test:unit`, `pnpm test:e2e`, `pnpm test:visual` — unchanged v1 scripts.
  *Verify:* all exit 0; zero golden churn (`git`-less repo: compare by `diff -rq` of `tests/visual/goldens` against v1's). If visual fails here but passed in step 1, the copy broke parity — diagnose the copy, never the goldens.
- [ ] **5. tsconfig flags (D2, D18).** Enable `exactOptionalPropertyTypes` + `verbatimModuleSyntax`; fix type-level errors only. Checkpoint: >~50 errors → report count, stop.
  *Verify:* `pnpm check` 0; step-4 suites re-run green, zero golden churn.
- [ ] **6. Vitest port (D3).** Add exact-pinned `vitest`; port the 19 `tests/unit/*.test.ts` mechanically (`node:test`/`node:assert` → vitest APIs); `test:unit` → `vitest run` (bare command, toolchain R007).
  *Verify:* `pnpm test:unit` 0, 19 files passing; diff shows import/assertion API changes only.
- [ ] **7. oxlint gate (toolchain R013).** Exact-pinned oxlint + config, wired alongside the check gate (never replacing astro check/tsc/svelte-check). Fix or explicitly configure-out findings.
  *Verify:* lint + `pnpm check` exit 0.
- [ ] **8. Recipe→feature map.** From `tests/visual/recipes.ts` (23 recipes, 21 goldens/viewport), write `Instructions/01-pre-phase/recipe-feature-map.md` (status header per doc-practice R007) mapping every recipe + golden PNG to phase 02–11 (or `smoke`/none). This file also becomes home to D21's snapshot-path decision (phase 03 records it).
  *Verify:* all 42 PNGs mapped exactly once.
- [ ] **9. Playwright projects (D6, D12).** Root config: `legacy` project pinning v1's current spec set/behavior; new `smoke` project + `tests/ui/smoke/` spec (6 routes load, no console errors, terminal boots). Move `tests/e2e/fixtures.ts`/`contentFixtures.ts` → `common/tests/ui/support/` (kebab-case, D15), import paths updated (modules still at `src/lib/`).
  *Verify (D20):* real build → `--project=smoke --project=legacy` green; fixture build → legacy visual green; zero golden churn.
- [ ] **10. Design mirror initial push (D14/design-mirror R010–R011).** `pnpm design-mirror`, push both page sets via DesignSync to the pinned v2 project.
  *Verify:* push confirmed for `pages-real` + `pages-fixtures`.

## Acceptance criteria

1. Steps 1–10 verified; v1 untouched (goldens diff empty, no source/test/config edits there).
2. `pnpm check` + lint exit 0 with D2 flags on.
3. Vitest: 19 files green. D20 both invocations green. Goldens byte-identical to v1 (`diff -rq` empty).
4. `docs/` contains no `node --test`; R014 settled.
5. Stop conditions: no dependency changes beyond adding vitest/oxlint (exact-pinned); no source restructuring (no `features/`, no moves out of `src/lib`/`src/components`); no golden regeneration; no git operations (open question 1 in 00-phases.md).

## Results

### Step 1 — v1 pre-flight: first run RED (hard stop, reported), second run GREEN after orchestrator-authorized submodule init. Step 1 CLOSED.

**Orchestrator authorized `git submodule update --init` in v1 (environment defect: submodules never initialized on this machine; non-destructive; user-approved overnight autonomy).**

#### First run (RED — hard stop, reported to orchestrator; preserved verbatim below for history)

**Goldens status:** `git -C <v1> status --porcelain tests/visual/goldens` empty before the run AND after the run (re-checked post test:visual). No golden regeneration occurred, none attempted.

**Exit codes:**

| suite | command | exit | detail |
|---|---|---|---|
| check | `pnpm check` | 0 | 0 errors, 0 warnings, 98 hints (astro check); tsc clean; svelte-check 0 errors/10 warnings |
| unit | `pnpm test:unit` | 0 | 339/339 passing (`node --test`) |
| e2e | `pnpm test:e2e` | **1** | 900 passed, **104 failed**, 2 skipped (both viewports 1512x945 + 1920x1080) |
| visual | `pnpm test:visual` | **1** | 48 passed, **2 failed** (`09-grep-empty` at both viewports) |

**e2e root cause (all 104 failures traced to one cause):** v1's 8 git submodules under `repos/` are **uninitialized** on this machine (`git submodule status` shows every entry prefixed `-`, meaning not checked out — the directories are empty). `scripts/generate.mjs` (v1's own `prebuild`/`predev` script — writing to it is inside the read-only exemption) consequently logged `0 text files (0 tokenized)` for all 8 repos and produced empty tree/commit indexes. Every failing spec depends on real repo file content in the Repositories feature: `editor-vim.spec.ts` (42, entry point is a file opened via Repositories), `repositories.spec.ts` (36), `cmdline.spec.ts` (12, ex-mode opened from a Repositories-opened file), `repositories-preview-highlight.spec.ts` (4), `repositories-preview-scroll.spec.ts` (2), `help-search.spec.ts` (2, gating check opens a file editor via Repositories), `editor-cursor-visibility.spec.ts` (2), `copy-mode.spec.ts` (2), `tmux.spec.ts` (4, Ctrl-b Ctrl-b inside the vim editor opened via Repositories). First failure verified directly: `cmdline.spec.ts:452` times out waiting for `[data-testid="repositories-tree-row"][data-entry-name="README.md"]` after clicking the `transcript-tts` repo row — that row never renders because the submodule tree is empty.

**Side effect of running the pre-flight (within the read-only exemption, but noteworthy):** `git -C <v1> status --porcelain` (full, not just goldens) shows `generate.mjs` rewrote tracked generated files while submodules were empty: `public/generated/repos/*.json` (all 8) are now genuinely empty (0 text files each, confirmed above). `public/generated/{contributions,fs-index,grep-index}.json` and `src/generated/file-icons.json` were also rewritten, but not all in the same way — `contributions.json` was re-scraped live (370 days, populated, just a different snapshot than before); `grep-index.json`/`fs-index.json` show non-zero counts (234/283) so are plausibly scanning `src/` rather than `repos/` — not independently confirmed empty. `src/generated/file-icons.json` **is confirmed broken** (see next paragraph — direct cause of the visual failure). These are exactly the files the D1/step-3 bulk-import plans to copy for the "keep-existing-on-failure fallback"; copying them now would import this degraded generated state into v2. Also pre-existing (present before any command I ran, not caused by this pre-flight — no baseline porcelain was captured before the first command, so this can't be attributed with certainty to an earlier session vs. this one, but nothing in my command sequence touches `.gitmodules`): `.gitmodules` has one uncommitted line changed (`Legend-of-Arlo-Guardians-Gauntlet` URL casing), and `PLAN.md`/`prompt.md`/`.claude/`/`.github/` are untracked.

**Visual failure (`09-grep-empty`) — traced to the SAME root cause as the e2e failures, not independent.** Both viewports differ by exactly 40 pixels (~0.01%/~0.00003 ratio), confined entirely to the file-type icon glyph on the `.github/workflows/deploy.yml` row in the grep pane (verified by reading the diff/actual/expected PNGs: golden shows a distinct reddish GitHub-Actions-style icon, actual shows a plain generic file icon). Root cause confirmed by diffing `src/generated/file-icons.json` (HEAD vs. working tree): `generate.mjs` derives its observed extension→icon map (`byExt`) by scanning encountered file extensions, and evidently scans across the (now-empty) submodule repo indexes as part of that pass. The pre-pre-flight (`HEAD`) version has `byExt` = `{astro, css, go, html, java, jpg, js, json, md, mjs, pdf, png, py, sh, svelte, svg, toml, ts, txt, woff2, yaml, yml}` (`yml → yaml` icon); the post-run (broken-submodule) version has only `{astro, css, jpg, json, md, mjs, pdf, png, svelte, svg, ts, woff2, yaml}` — `yml` and 8 other extensions vanished entirely. `pnpm test:visual`'s `build:fixtures` does not run Astro's `prebuild` hook (that only fires for plain `build`), so it consumed the `file-icons.json` already broken by `test:e2e`'s `prebuild` run moments earlier — one shared root cause (uninitialized submodules → generate.mjs), two visible symptoms (e2e timeouts + this icon regression), not two separate problems. Expectation: submodule init + regeneration likely restores the `yml` icon entry and clears this failure too, but that is not yet verified.

**Decision needed from the orchestrator before step 1 can close green (now a single decision, not two):** authorize (or not) `git submodule update --init` in v1, followed by re-running `node scripts/generate.mjs` and re-running the step-1 suites. This writes only under `repos/` plus regenerates the already-modified `public/generated/`/`src/generated/` files — no v1 source/test/config edits — but sits outside the literal "files its own scripts write" exemption as originally worded, hence flagged rather than done unilaterally. If this restores both e2e and the `09-grep-empty` icon to green (expected but unverified), step 1 needs only a clean re-run to close. If the icon diff persists even after submodule init, the `RATIO_RELAXED`/`maxDiffPixelRatio: 0.0005` relaxation question (this recipe currently isn't in that set; the observed ratio would pass under it) becomes a live secondary decision.

**Full submodule SHAs** (from `git submodule status`, for step 3's `git submodule add ... ` pinning, in case v1 stays uninitialized and v2 must pin without an init step):
- `repos/transcript-tts` → `ab88cac7eb2fba7cccc6915055a5983c4a6b77f4`
- `repos/daily-tech-digest` → `91d8a7862da4ff3bfae219b81e98b8db937cbaca`
- `repos/Legend-of-Arlo-Guardians-Gauntlet` → `ef0fd3c6f8388c44c6e2223e5121f3aa75efe8d1`
- `repos/SpotifyPal` → `35430f06067aab0154092f2bb60cb2ac0f3d5909`
- `repos/Advent-of-Code-2024` → `b2f5a18b695e465b6c79d74bbe7ecde7478c433e`
- `repos/Advent-Of-Code-2023` → `5b141d3d65b1d3ee09a80375e218c73b94614090`
- `repos/Sheldon` → `d03609a362414b979d50da0a2ea32c1211274de7`
- `repos/Data-Structures-And-Algorithms` → `27e94ec117c33e130126f40ee1809bf101a6a47f`

(Note: with submodules uninitialized, PLAN step 3's own method — `git -C <v1>/repos/<name> rev-parse HEAD` — fails on the empty dirs; these `git submodule status` SHAs are the fallback source if v1 is not initialized before step 3 runs. Now that v1's submodules are initialized (see second run below), step 3 can use either method; the SHAs above remain valid either way since they match what `git submodule status` shows post-init.)

#### Second run (GREEN — after orchestrator authorization)

**Remediation performed, in order:**
1. `git -C <v1> status --porcelain` snapshotted before touching anything further (saved for comparison) — identical to the porcelain already recorded above from the first run (no new entries).
2. `git -C <v1> submodule update --init` (exactly as authorized — no `--remote`, no `--recursive`; none of the 8 submodules needed it). Exit 0. All 8 checked out at their pinned SHAs, each landing on `heads/main` — matching the SHA table above exactly (e.g. `transcript-tts` → `ab88cac7...`, `Sheldon` → `d03609a3...`).
3. Confirmed via `git -C <v1> submodule status`: no `-` prefixes remain on any of the 8 entries.
4. Confirmed `git -C <v1> status --porcelain` (full) gained nothing new versus the pre-init snapshot — a plain `diff` of the two snapshots is empty. Only the already-recorded pre-existing entries remain (`.gitmodules`, `public/generated/*`, `src/generated/*`, untracked `.claude/`/`.github/`/`PLAN.md`/`prompt.md`).
5. `node scripts/generate.mjs` (v1's own script) re-run. All 8 repos now report real file counts (e.g. `Data-Structures-And-Algorithms.json — 165 text files (164 tokenized)`, `daily-tech-digest.json — 53 text files (48 tokenized)`, previously 0/0 for every repo). `file-icons.json` went from `13 extensions` (broken run) to **22 extensions** — matching `HEAD`'s original 22 exactly, confirmed by diffing `byExt` keys: `{astro, css, go, html, java, jpg, js, json, md, mjs, pdf, png, py, sh, svelte, svg, toml, ts, txt, woff2, yaml, yml}`, with `yml → yaml` restored.
6. Goldens re-snapshotted (`git -C <v1> status --porcelain tests/visual/goldens`): empty before this remediation and empty after — unchanged throughout, no regeneration.

**Exit codes (second run):**

| suite | command | exit | detail |
|---|---|---|---|
| check | `pnpm check` | 0 | 0 errors, 0 warnings, 98 hints (astro check); tsc clean; svelte-check 0 errors/10 warnings — identical to first run |
| unit | `pnpm test:unit` | 0 | 339/339 passing — identical to first run |
| e2e | `pnpm test:e2e` | **0** | **1006/1006 passed**, 0 failed (both viewports) — all 104 first-run failures now green, confirming the submodule root cause |
| visual | `pnpm test:visual` | **0** | **50/50 passed**, 0 failed — `09-grep-empty` now green at both viewports, confirming the shared root cause with the icon-map regression |

**Conclusion:** step 1 is now fully green on every axis (D18-style checkpoint not applicable here — this step doesn't touch tsconfig). Goldens byte-identical throughout (diff empty before and after both runs). No v1 source, test, or config file was edited — only `repos/` was populated by `git submodule update --init` (git-tracked submodule content, not v1 source) and v1's own `generate.mjs` regenerated its own output files, both explicitly authorized. Proceeding to steps 2–10 per the PLAN, using the submodule SHA table above for step 3.

No commits made yet at the time of this remediation. No source/config edits made anywhere (v1 or v2) beyond what v1's own scripts wrote and the authorized submodule init. Steps 2–10 proceed next.

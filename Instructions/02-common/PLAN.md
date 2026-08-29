# Phase 02 — common

> **Status: planned, not started. Blocked on phase 01.** Binding decisions: `Instructions/00-phases.md` (D5–D10, D15–D17, D20–D23).

## Context

`src/common` — engines, shared components, shared lib, and `common/tests/`. **Declared out-of-context wiring:** Terminal.svelte/terminalState + layout → `src/bootstrap/` (composition root, D10); thinning `src/pages/*.astro` to import only from bootstrap; one `common` Playwright project entry; mechanical import-path updates across the legacy tree and specs (legacy-fallout rule, 00-phases.md). Because of the bootstrap wiring, this phase's gate is the full suite, not a scoped run.

## Objective

Everything shared — tmux/vim engines, editor, kernel chrome, shared lib — lives under `src/common/` per architecture R001/R006/R007; the composition root lives in `src/bootstrap/`; the 12 kernel+editor specs run green as the `common` project; goldens unchanged.

## Background — move table (v1 names → v2 homes; renames per D15)

| v1 | v2 |
|---|---|
| `src/lib/tmux.ts` | `src/common/engines/tmux/tmux.ts` (feature-agnostic — R007: no feature-name unions; feature knowledge injected from bootstrap) |
| `src/lib/vim.ts` | `src/common/engines/vim/vim.ts` |
| `src/components/editor/*` (`Editor.svelte`, `EditorBuffer.svelte`, `EditorStatusLine.svelte`, `editorState.svelte.ts`) | `src/common/components/editor/` |
| `src/lib/editorRender.ts` | `src/common/components/editor/editor-render.ts` (or `common/lib/` if grep shows consumers beyond editor) |
| `src/components/{StatusBar,Meter,PaneTree,PanelBadge,Wallpaper,Cmdline,CopyMode,ChooseTree}.svelte` | `src/common/components/` |
| `src/lib/{clock,views,layout,pasteTargets,pasteBuffer,cmdline,data}.ts` | `src/common/lib/` (kebab-case: `paste-targets.ts`, `paste-buffer.ts`) |
| `src/components/terminal/{Terminal.svelte,terminalState.svelte.ts}` | `src/bootstrap/` |
| `src/layouts/Shell.astro` | `src/bootstrap/Layout.astro` (D13 — resolves the `Shell.svelte` collision; rendering-neutral) |
| `src/data/{site,choosetree,cmdline}.yaml` | `src/common/content/` with `data.ts` glob widened per D17 |
| specs: `terminal, tmux, panes, sessions, choose-tree, copy-mode, cmdline, nav, panel-badge, animations, editor-vim, editor-cursor-visibility` | `common/tests/ui/e2e/` |
| unit: `tmux, cmdline, views, vim` `.test.ts` | `common/tests/unit/` (or engine-adjacent per unit-testing.md R001 — settle once, record here) |

Judgment calls for the executor (consult advisor): `pages/*.astro` and `src/content.config.ts` stay put (D10 — Astro hard-codes them). `cmdline.spec.ts` imports `src/lib/grep.ts` — grep.ts does **not** move this phase; only its import path in the spec survives unchanged. Any module in the table whose grep shows a single feature consumer stays put for that feature's phase instead (D16) — record deviations in Results.

## Steps

- [x] **1. Port specs.** Move the 12 specs verbatim (import paths only) → `common/tests/ui/e2e/`; add `common` project entry; shrink `legacy` scope accordingly. Seed common-mapped goldens (per `Instructions/01-pre-phase/recipe-feature-map.md`) → `common/tests/ui/visual/goldens/<viewport>/` byte-identical (`cp` + `cmp`), with a `common-visual` project reusing the D21 mechanics **only if** phase 03 has recorded them; if 02 runs before 03, this phase settles D21 itself and records it in the map file.
  *Verify (D20):* real build → `--project=common --project=legacy --project=smoke` green against un-moved source; fixture build → visual green; goldens `cmp`-identical.
  *Result:* done. Phase 02 ran first, so it settled D21 itself (full record in `recipe-feature-map.md`'s "D21 snapshot-path decision" section). 12 specs moved with import-path/extension fixes; shared visual infra (`pipeline.mjs`, `recipes.ts`, `static-server.mjs`, `capture-goldens.mjs`, `checkFixtureFlag.ts`→`check-fixture-flag.ts`, `reference/`) moved to `common/tests/ui/support/` (top-level, matching pre-phase's own `fixtures.ts`/`content-fixtures.ts` precedent there, not `src/common/tests/`). Added `common-<viewport>` e2e projects and `common-visual-<viewport>` visual projects (each with its own hardcoded-viewport `snapshotPathTemplate`, D21(a)) to `playwright.config.ts`; updated `package.json` (`goldens`, `test:visual`, `test:e2e`), `tsconfig.json` exclude, `.oxlintrc.json` ignore pattern, and 2 build-tooling scripts (`scripts/capture-screenshots.mjs`, `scripts/generate-design-mirror.mjs`) that imported the moved infra directly. Seeded 8 PNGs (4 recipes × 2 viewports: `06-editor`, `15-cmdline`, `18-split`, `19-choose-tree`) to `common/tests/ui/visual/goldens/`, `cmp`-verified byte-identical against v1, then removed the now-orphaned originals from `tests/visual/goldens/`. Gates run against un-moved source (source moves in step 2): real build → `smoke`+`legacy-1512x945`+`legacy-1920x1080`+`common-1512x945`+`common-1920x1080` = 1012 passed; fixture build → `tests/visual/identical.spec.ts` (17 recipes, common's 4 filtered out via `COMMON_OWNED_RECIPE_NAMES`) + `adversarial-fixtures.spec.ts` + new `common/tests/ui/visual/identical.spec.ts` (the 4 common recipes) = 50 passed. `pnpm check` and `pnpm lint` both clean (exit 0).
- [ ] **2. Move source** per the table; update every import across legacy tree, specs, `common/tests/ui/support/` fixtures; literal-path assertions per D8; delete originals.
  *Verify:* old paths absent; `grep -rn "src/lib/tmux\|src/lib/vim\|components/editor\|layouts/Shell" src tests` empty (excluding goldens/generated).
- [ ] **3. Full gate.** `pnpm check` + lint + `pnpm test:unit` + D20 both invocations (all projects).
- [ ] **4. Golden parity.** Zero golden churn anywhere (`diff -rq` vs v1 slices).
- [ ] **5. Move unit tests** per table; Vitest globs widened once to cover `common/tests/unit` + `src/features/*/tests/unit`.
  *Verify:* `pnpm test:unit` green, same test count as phase 01 close.

## Acceptance criteria

Full D20 gate green; check/lint/unit green; goldens byte-identical; architecture R004 holds for everything moved (common imports no feature; engines feature-agnostic per R007); verifier PASS + auditor clean on `src/common` (D23 exemptions apply); commit per 00-phases.md discipline (contingent on git question). Stop conditions: no engine redesign (move, don't rewrite); no POM/locator refactors; no golden regeneration; nothing moved into `features/`.

## Results

(executor fills in)

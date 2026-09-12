# Phase 09 — repositories

> **Status: planned, not started. Blocked on phase 08.** Binding decisions: `Instructions/00-phases.md`. Largest feature phase.
> Carried-in item (phase-07 close, 2026-09-12): a single `legacy-1512x945 › repositories.spec.ts` failure surfaced once during phase 07's execution and did **not** reproduce in the verifier's subsequent clean 1012-pass real-build run. Phase 07's diff touches zero repositories-tree files, and its only shared-file change (`data.ts`'s `?raw` repoints) would fail deterministically rather than intermittently — so it is not attributable to phase 07, but it was logged rather than declared cleared. **This phase should watch for it**: if `repositories.spec.ts` proves genuinely flaky once repositories sits in its own context, root-cause it here rather than re-deferring.
> Carried-in item (phase-04 close audit, 2026-09-08): `common/tests/ui/pages/TerminalPage.ts:7` names a `RepositoriesPage` that doesn't exist yet — a pre-migration forward reference. This phase's page-object step should create it there (closing the reference) or, if no page object is warranted, strip the mention in the same change (comments.md R003).

## Context

`src/features/repositories`. Out-of-context wiring: project entries, legacy fallout, `content.config.ts` real + fixture-switch paths for `repositories` (D22), `build:fixtures` source paths for `fixtures/repos/*.json` + `fixtures/commits/*` (D22), and `scripts/generate.mjs` path constants **only where they name moved files** (the `REPOS` list, `OWNER`, and output destinations under `public/generated/`/`src/generated/` are unchanged).

## Objective

The full Repositories feature — panels, repo browse, preview highlighting, commits — migrated verbatim and green; the generate-time-only client-bundle boundary for `highlight.ts` preserved (delegate.md's Shiki note).

## Background — move table

| v1 | v2 |
|---|---|
| `src/components/repositories/*` (`Repositories.svelte`, `RepositoriesPanel.svelte`, `ReposPanel.svelte`, `FilesPanel.svelte`, `CommitsPanel.svelte`, `PreviewPanel.svelte`, `StatusPanel.svelte`, `repositoriesState.svelte.ts`) | `src/features/repositories/components/` |
| `src/lib/{repoTree,commits,githubCommits,githubTrees,fileIcons}.ts` | `src/features/repositories/lib/` (kebab-case per D15: `repo-tree.ts`, `github-commits.ts`, …) |
| `src/lib/highlight.ts` | `src/features/repositories/lib/highlight.ts` **iff** grep shows only generate.mjs + repositories consumers; it must remain generate-time-only — never client-bundled (verify no runtime import chain reaches it) |
| `src/content/repositories/` + `src/data/repositories.yaml` | `src/features/repositories/content/` + `content.config.ts` real-path update |
| `fixtures/repositories/`, `fixtures/repos/*.json`, `fixtures/commits/*` | `src/features/repositories/tests/ui/support/` + D22 path updates (fixture-switch + `build:fixtures` sources; `dist/generated/` destinations unchanged) |
| `fixtures/contributions.json` | `src/features/repositories/tests/ui/support/` + `build:fixtures` source-path update (D22; `dist/generated/contributions.json` destination unchanged). **Reassigned here from phase 07 by orchestrator ruling 2026-09-12** (recorded under D7 in `00-phases.md`): D7's original dashboard leg was falsified by the code — dashboard has zero consumers, while this context has two, `repositoriesState.svelte.ts`'s runtime `fetch("/generated/contributions.json")` and `StatusPanel.svelte`'s contribution grid. Phase 07 deliberately left the file and its `cp` clause untouched. **Do not assume it already moved.** Note `public/generated/contributions.json` is a *different*, generated artifact written by `generateContributions()` in `scripts/generate.mjs` — build tooling that stays in `scripts/` and never moves |
| `src/generated/commits/` | stays `src/generated/` (generated artifact, not source — generate.mjs writes it) |
| specs `repositories, repositories-preview-highlight, repositories-preview-scroll, repositories-status-dots`; unit `repoTree, githubCommits, githubTrees, highlight, all-projects-fixture, keyframes-dedup` (verify `keyframes-dedup`'s real owner by reading it — reassign in Results if not repositories) | `tests/ui/e2e/`; `tests/unit/` |
| repositories-mapped goldens | `tests/ui/visual/goldens/<viewport>/` |

`repos/` (8 checked-out repos at root) stays at root — it is generate.mjs input, not source.

## Steps

- [ ] **1–5.** The per-feature loop per `Instructions/03-profile/PLAN.md`, with this table; D21 reused verbatim. Step 2 additionally: run `node scripts/generate.mjs` after the move and confirm it completes with all 5 artifact kinds (its keep-existing fallbacks make missing-network acceptable; a thrown error is not).
- [ ] **6. Feature harness (D24).** Reuse phase 03's mechanism: harness route mounting `Repositories` with seeded fixture props (fixture repos/commits JSON); specs in `tests/ui/harness/`, project `repositories-harness` (fixture build).
  *Verify:* fixture build → `--project=repositories-harness` green; real build → no `harness/` output in `dist/`.

## Acceptance criteria

Loop + harness verified; generate.mjs green post-move; verifier PASS + auditor clean on `src/features/repositories` (D23); commit per 00-phases.md. Stop: no generator redesign; no icon/theme changes; `material-file-icons`/Shiki stay build-time-only (delegate.md pattern).

## Results

(executor fills in)

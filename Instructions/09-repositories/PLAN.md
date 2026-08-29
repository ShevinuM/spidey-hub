# Phase 09 — repositories

> **Status: planned, not started. Blocked on phase 08.** Binding decisions: `Instructions/00-phases.md`. Largest feature phase.

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

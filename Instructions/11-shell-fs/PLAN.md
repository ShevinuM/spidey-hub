# Phase 11 — shell-fs

> **Status: planned, not started. Blocked on phase 10.** Binding decisions: `Instructions/00-phases.md`. Last migration phase — closes out the legacy tree.

## Context

`src/features/shell-fs`. Out-of-context wiring: project entries, `build:fixtures` source path for `fixtures/fs-index.json` (D22), the final fs-index literal-path sweep (D8), **deleting the emptied `legacy` Playwright project**, removing `data.ts`'s `src/data/` glob leg (D17 closeout), and deleting the now-empty `src/components/`/`src/lib/`/`src/data/` directories.

## Objective

The in-window shell migrated verbatim and green; the legacy tree gone; `src/` contains only `features/`, `common/`, `bootstrap/`, `pages/`, `content.config.ts`, `styles/`, `generated/` (+ Astro-required entries).

## Background — move table

| v1 | v2 |
|---|---|
| `src/components/Shell.svelte` (the shell feature — distinct from the layout renamed in phase 02) | `src/features/shell-fs/components/Shell.svelte` |
| `src/lib/shell.ts`, `src/lib/shellIndex.ts` | `src/features/shell-fs/lib/shell.ts`, `shell-index.ts` (D15) |
| `src/data/shell.yaml` | `src/features/shell-fs/content/` (D17) |
| `fixtures/fs-index.json` | `src/features/shell-fs/tests/ui/support/` + D22 (same golden-affecting caveat as phase 10's fixture index: real-path content changes go to the orchestrator) |
| spec `shell.spec.ts`; unit `shell.test.ts` | `tests/ui/e2e/`; `tests/unit/` |
| shell-mapped goldens | `tests/ui/visual/goldens/<viewport>/` |

`FS_INDEX_SUBDIRS = ["src","public","fixtures","scripts","tests"]` — `fixtures/` empties this phase (its last members move); update the list to the real remaining tree and regenerate `public/generated/fs-index.json`; update `shell.spec.ts` literal assertions in the same change (D8). `shellIndex.ts` is the impure fetch boundary — it stays a separate module from pure `shell.ts` (unit-testing R001).

## Steps

- [ ] **1–5.** The per-feature loop per `Instructions/03-profile/PLAN.md`, with this table; D21 reused verbatim.
- [ ] **6. Feature harness (D24).** Reuse phase 03's mechanism: harness route mounting `Shell` with the fixture fs index; specs in `tests/ui/harness/`, project `shell-fs-harness` (fixture build).
  *Verify:* fixture build → `--project=shell-fs-harness` green; real build → no `harness/` output in `dist/`.
- [ ] **7. Legacy closeout.** Delete `legacy` project entry (must be empty); delete empty `src/components/`, `src/lib/`, `src/data/`, `fixtures/`, `tests/e2e/`, `tests/visual/` remnants (anything non-empty = an unmigrated file → STOP and report, don't relocate ad hoc). Remove `data.ts`'s `src/data/` glob leg. Update `Instructions/Planning/test-setup.md` + `delegate.md` status headers to executed (doc-practice R003) and re-push the design mirror if any rendering-affecting change occurred (D14).
  *Verify:* directories gone; full D20 gate green; `pnpm check` + lint + unit green.

## Acceptance criteria

Loop + harness + closeout verified; **whole-repo** verifier run (this phase ends the migration: D20 both invocations across every project, zero golden churn repo-wide) + auditor clean on `src/features/shell-fs` (D23); commit per 00-phases.md. Stop: no shell-builtin changes; deferred items (00-phases.md) stay deferred.

## Results

(executor fills in)

# Phase 10 — grep

> **Status: planned, not started. Blocked on phase 09.** Binding decisions: `Instructions/00-phases.md` — especially **D8**: this feature's product output *is* the repo's file tree.

## Context

`src/features/grep`. Out-of-context wiring: project entries, legacy fallout, `build:fixtures` source path for `fixtures/grep-index.json` (D22), and the **final sweep of grep-related literal-path assertions** (test-setup.md §"Behavioral breakage").

## Objective

Grep overlay migrated verbatim and green, with `grep.spec.ts`'s literal path assertions matching the real (mostly-restructured) tree.

## Background — move table

| v1 | v2 |
|---|---|
| `src/components/grep-overlay/*` (`GrepOverlay.svelte`, `QueryListPanel.svelte`, `PreviewPanel.svelte`, `grepOverlayState.svelte.ts`) | `src/features/grep/components/` |
| `src/lib/grep.ts` | per D16: `cmdline.spec.ts` (common) also imports it for expected values — if runtime code in common/bootstrap consumes it too, promote to `common/lib/grep.ts`; if only the spec does, it stays `src/features/grep/lib/grep.ts` and the spec's import reaches into the feature **as a test-only single-source-of-truth import** (record the call in Results) |
| `src/data/grep.yaml` | `src/features/grep/content/` (D17) |
| `fixtures/grep-index.json` | `src/features/grep/tests/ui/support/` + `build:fixtures` source (D22; destination unchanged) — first verify whether it embeds real v1 tree paths: if yes, changing it is golden-affecting → **report to orchestrator, do not absorb** |
| spec `grep.spec.ts`; unit `grep.test.ts` | `tests/ui/e2e/`; `tests/unit/` |
| grep-mapped goldens | `tests/ui/visual/goldens/<viewport>/` |

`GREP_ROOT_SUBDIRS = ["src","scripts","tests"]` stays valid (all moves stay under `src/`); confirm `GREP_ROOT_FILES` still lists real root files. Regenerate `public/generated/grep-index.json` after the move; update `grep.spec.ts`'s literal path assertions (e.g. `rowByPath(page, "src/lib/grep.ts")`) to the new real paths in the same change.

## Steps

- [ ] **1–5.** The per-feature loop per `Instructions/03-profile/PLAN.md`, with this table; D21 reused verbatim; the assertion sweep and index regeneration are part of step 2.
- [ ] **6. Feature harness (D24).** Reuse phase 03's mechanism: harness route mounting `GrepOverlay` with the fixture grep index; specs in `tests/ui/harness/`, project `grep-harness` (fixture build).
  *Verify:* fixture build → `--project=grep-harness` green; real build → no `harness/` output in `dist/`.

## Acceptance criteria

Loop + harness verified; real-build grep e2e asserts current-tree paths; verifier PASS + auditor clean on `src/features/grep` (D23); commit per 00-phases.md. Stop: no scoring/search changes; fixture index content changes only via orchestrator decision.

## Results

(executor fills in)

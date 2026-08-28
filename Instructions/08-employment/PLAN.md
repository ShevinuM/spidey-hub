# Phase 08 — employment

> **Status: planned, not started. Blocked on phase 07 (and on phase 02 for the editor, which employment's preview renders).** Binding decisions: `Instructions/00-phases.md`.

## Context

`src/features/employment`. Out-of-context wiring: project entries, legacy fallout, `content.config.ts` fixture-switch paths for `personnel` (D22).

## Objective

Employment records (records/timeline/preview panels) migrated verbatim and green. The editor it renders already lives in `src/common/components/editor/` (phase 02, D9) — this phase only consumes it.

## Background — move table

| v1 | v2 |
|---|---|
| `src/components/employment-records/*` (`EmploymentRecords.svelte`, `RecordsPanel.svelte`, `TimelinePanel.svelte`, `PreviewPanel.svelte`, `employmentRecordsState.svelte.ts`) | `src/features/employment/components/` |
| `src/content/personnel/` (variable-depth tree — preserve on-disk case; custom `generateId` depends on it) | `src/features/employment/content/personnel/` + `content.config.ts` real-path update |
| `fixtures/personnel/` | `src/features/employment/tests/ui/support/personnel/` + `content.config.ts` **fixture-switch** path update (D22) |
| `src/data/personnel.yaml` | `src/features/employment/content/` (D17) |
| specs `employment, employment-layout`; unit: none feature-owned (`vim.test.ts` moved in phase 02) | `tests/ui/e2e/` |
| employment-mapped goldens | `tests/ui/visual/goldens/<viewport>/` |

Note: `PreviewPanel.svelte` exists in both `employment-records/` and `repositories/` — they are different files; move only employment's. Employment imports editor from `common/` — allowed (feature → common, architecture R004); it must not import anything from `features/repositories`.

## Steps

- [ ] **1–5.** The per-feature loop per `Instructions/03-profile/PLAN.md`, with this table; D21 reused verbatim; fixture-switch updates (D22) land in step 1 with the fixture move, gated by the fixture-build invocation.

## Acceptance criteria

Loop verified; verifier PASS + auditor clean on `src/features/employment` (D23); commit per 00-phases.md. Stop: no editor changes (that's common's code); no personnel-tree reshaping.

## Results

(executor fills in)

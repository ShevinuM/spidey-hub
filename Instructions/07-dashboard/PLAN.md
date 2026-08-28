# Phase 07 — dashboard

> **Status: planned, not started. Blocked on phase 06.** Binding decisions: `Instructions/00-phases.md`.

## Context

`src/features/dashboard`. Out-of-context wiring: project entries, legacy fallout, D22 (`fixtures/contributions.json` move → `build:fixtures` source-path update).

## Objective

Dashboard view + wordmark + tracker HUD migrated verbatim and green.

## Background — move table

| v1 | v2 |
|---|---|
| `src/components/Dashboard.svelte` | `src/features/dashboard/components/Dashboard.svelte` |
| `src/lib/wordmark.ts` | `src/features/dashboard/lib/wordmark.ts` |
| `src/data/{dashboard,tracker}.yaml` | `src/features/dashboard/content/` (D17) |
| `fixtures/contributions.json` | `src/features/dashboard/tests/ui/support/` + `build:fixtures` source path (D22 — destination in `dist/generated/` unchanged) |
| spec `dashboard.spec.ts`; unit `tracker-hud.test.ts` | `tests/ui/e2e/`; `tests/unit/` |
| dashboard-mapped goldens (incl. `01-dashboard`) | `tests/ui/visual/goldens/<viewport>/` |

Judgment call: `public/generated/contributions.json` generation (generate.mjs step 4) is build tooling — it stays in `scripts/`; only the *fixture* file moves.

## Steps

- [ ] **1–5.** The per-feature loop per `Instructions/03-profile/PLAN.md`, with this table; D21 reused verbatim.

## Acceptance criteria

Loop verified; verifier PASS + auditor clean on `src/features/dashboard` (D23); commit per 00-phases.md. Stop: no contribution-graph/tracker logic changes.

## Results

(executor fills in)

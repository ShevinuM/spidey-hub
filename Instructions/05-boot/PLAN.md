# Phase 05 — boot

> **Status: planned, not started. Blocked on phase 04.** Binding decisions: `Instructions/00-phases.md`.

## Context

`src/features/boot`. Out-of-context wiring: project entries, legacy fallout — **notably `common/tests/ui/support/` fixtures import `BOOT_SEEN_STORAGE_KEY` from `bootState.ts`**; that import path updates in the same change (D8/legacy-fallout rule). `content.config.ts` pointer for `content/boot`; `boot.yaml` per D17.

## Objective

Boot sequence + boot state migrated verbatim and green; `cold-boot.spec.ts`'s real-boot path (it deliberately bypasses the shared fixture) still exercised.

## Background — move table

| v1 | v2 |
|---|---|
| `src/components/BootSequence.svelte` | `src/features/boot/components/BootSequence.svelte` |
| `src/lib/boot.ts`, `src/lib/bootState.ts` | `src/features/boot/lib/boot.ts`, `boot-state.ts` (D15) |
| `src/content/boot/`, `src/data/boot.yaml` | `src/features/boot/content/` |
| specs `boot, cold-boot`; unit `boot.test.ts` | `tests/ui/e2e/`; `tests/unit/` |
| boot-mapped goldens (per recipe map) | `tests/ui/visual/goldens/<viewport>/` |

Note: `boot.spec.ts` imports raw `@playwright/test` (not the shared fixture) on purpose — port that behavior untouched.

## Steps

- [ ] **1–5.** The per-feature loop exactly as `Instructions/03-profile/PLAN.md` defines it, with this phase's table; D21 mechanics reused verbatim. The shared-support-fixture import update is part of step 2's same-change fallout.

## Acceptance criteria

Loop verified; verifier PASS + auditor clean on `src/features/boot` (D23); commit per 00-phases.md. Stop: no boot-timing/behavior changes; no golden regeneration.

## Results

(executor fills in)

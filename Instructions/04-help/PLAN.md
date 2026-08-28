# Phase 04 — help

> **Status: planned, not started. Blocked on phase 03.** Binding decisions: `Instructions/00-phases.md` — especially **D11** (fuzzysort) and its golden-freeze constraint.

## Context

`src/features/help`. Out-of-context wiring: project entries, legacy fallout, `content.config.ts` pointer for `content/help`, D22.

## Objective

Help views + `?` fuzzy search migrated verbatim and green; then, as a separate verified step, the hand-rolled matcher delegated to `fuzzysort` (delegate.md's one real action item) — bespoke corpus + tie-break kept.

## Background — move table

| v1 | v2 |
|---|---|
| `src/components/HelpView.svelte`, `src/components/HelpSearch.svelte` | `src/features/help/components/` |
| `src/lib/helpSearch.ts` | `src/features/help/lib/help-search.ts` |
| `src/lib/docline.ts` | per D16: `common/lib/docline.ts` if ≥2 feature consumers verified by grep, else help's `lib/` |
| `src/content/help/` (13 docs), `src/data/{help,helpsearch}.yaml` | `src/features/help/content/` (+ `content.config.ts`, `data.ts` glob per D17) |
| specs `help, help-layout, help-search` `.spec.ts`; unit `helpSearch, docline` `.test.ts` | `tests/ui/e2e/`; `tests/unit/` |
| help-mapped goldens incl. `20-help-search` | `tests/ui/visual/goldens/<viewport>/` |

## Steps

- [ ] **1–5.** The per-feature loop exactly as `Instructions/03-profile/PLAN.md` defines it (verbatim spec port → source move → full D20 gate → golden parity → unit-test move), with this phase's table. D21 mechanics reused verbatim.
- [ ] **6. Fuzzysort swap (D11) — only after 1–5 are verified green.** Add exact-pinned `fuzzysort`; replace the tiered cascade + hand-written Levenshtein in `help-search.ts`; keep the two-shaped corpus building (`cmdline.yaml`/`content/help`/`shell.yaml`) and the commands-before-keymap-rows tie-break as a thin sort after scoring; delete dead code.
  *Verify:* unit + `--project=help` green (real build); **fixture build → `--project=help-visual` green with zero golden churn** — recipe `20-help-search`'s pixels are the hard gate. If ranking for the golden query changes: revert the swap, report back, the swap moves to Deferred (post-rebaseline). Deliberate `help-search.spec.ts` assertion changes allowed only if pixels hold, isolated in this step's own commit.

## Acceptance criteria

Loop + swap verified (or swap explicitly reverted-and-reported); verifier PASS + auditor clean on `src/features/help` (D23); commit discipline per 00-phases.md. Stop: no search-UX changes beyond what fuzzysort's scoring implies within the golden constraint.

## Results

(executor fills in)

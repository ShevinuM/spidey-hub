# Phase 03 — profile

> **Status: approved for execution 2026-09-08. Phases 01–02 closed.** Binding decisions: `Instructions/00-phases.md`. **D21 is already settled** — phase 02 ran first and recorded the snapshot-path mechanics in `Instructions/01-pre-phase/recipe-feature-map.md` (§ "D21 snapshot-path decision"). This phase REUSES that shape verbatim (architecture R003); it does not re-derive it.

## Context

`src/features/profile`. Declared out-of-context wiring: `profile`/`profile-visual` Playwright project entries; legacy-tree import fallout; `content.config.ts` collection pointer if `content/profile` moves (D22).

## Objective

The smallest feature migrated end-to-end — proving the per-feature loop: specs ported → source moved → full gate green → goldens byte-identical.

## Background — move table

| v1 | v2 |
|---|---|
| `src/components/Profile.svelte` | `src/features/profile/components/Profile.svelte` (flat, files-and-naming R012 — no forced folder split) |
| `src/lib/net.ts` | `src/features/profile/lib/net.ts` |
| `src/lib/resume.ts` | `src/common/lib/resume.ts` **only if** grep confirms ≥2 consumers (profile + cmdline, D16); else profile's `lib/` |
| `src/content/profile/` | `src/features/profile/content/` + `content.config.ts` pointer update |
| spec `profile.spec.ts`; unit `net.test.ts` | `src/features/profile/tests/ui/e2e/`; `tests/unit/` |
| profile-mapped goldens (per recipe map) | `src/features/profile/tests/ui/visual/goldens/<viewport>/` |

## Steps (the per-feature loop — never fuse steps)

- [ ] **1. Port specs + goldens.** Spec verbatim (import paths only; strip `.ts` extensions per D23(d)/FX.1). Seed goldens byte-identical (`cp`, then `cmp` each against v1). Create the visual spec from the v1 pipeline slice (D5). **Reuse D21 verbatim** as recorded in `Instructions/01-pre-phase/recipe-feature-map.md`: per-project `snapshotPathTemplate` with the viewport hardcoded from the `viewports` array entry (never `{projectName}`), goldens at `src/features/profile/tests/ui/visual/goldens/<viewport>/` (feature tests nest under `src/features/<f>/tests/`, unlike common's top-level `common/tests/`). Add `profile`/`profile-visual-<viewport>` project entries; shrink `legacy` (filter profile-owned recipes out of the legacy identical.spec via the same set-filter mechanism phase 02 used).
  *Verify (D20):* real build → `--project=profile` + `--project=legacy` green against un-moved source; fixture build → `--project=profile-visual` green; `cmp` clean.
- [ ] **2. Move source** per table (D15/D16); update imports + any literal-path assertions (D8); delete originals.
  *Verify:* `test ! -e src/components/Profile.svelte`; `grep -rn "lib/net\b\|components/Profile" src tests` shows only new paths.
- [ ] **3. Full gate.** check + lint + unit + D20 both invocations, all projects.
- [ ] **4. Golden parity.** Zero churn (`diff -rq` all goldens vs v1 slices).
- [ ] **5. Move unit tests** → `src/features/profile/tests/unit/`. *Verify:* `pnpm test:unit` green, count unchanged.
- [ ] **6. Feature harness (D24) — this phase SETTLES the mechanism for 04–11.** Build the fixture-build-only harness route (preferred: `src/pages/harness/[feature].astro`, `getStaticPaths` → `[]` unless `PORTFOLIO_FIXTURES=1`) mounting `Profile` with seeded fixture props; specs in `src/features/profile/tests/ui/harness/` under a `profile-harness` project (fixture build); record the mechanism in `Instructions/01-pre-phase/recipe-feature-map.md` alongside D21's shape, and add the checklist entries per D24(c) in the same change.
  *Verify:* fixture build → `--project=profile-harness` green; real build → `dist/` contains no `harness/` output; checklist entries present.

## Acceptance criteria

Loop verified 1–6; verifier PASS + auditor clean on `src/features/profile` (D23 exemptions); commit per 00-phases.md. Stop: no POM refactor, no behavior change, no golden regeneration.

## Results

(executor fills in — including the D21 shape chosen)

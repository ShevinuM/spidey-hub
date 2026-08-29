# Running the visual tests

> **Status: partially real (pre-phase, 2026-08-29).** `package.json`/`playwright.config.ts` exist; `pnpm test:visual` runs today, but against the two **transitional** viewport-named projects (`1512x945`/`1920x1080`, `testDir: tests/visual` — no per-feature `<feature>-visual` project exists yet, since no feature has moved its own recipes out of the bulk-imported legacy suite; see `../e2e/running-tests.md`'s own header and `Instructions/00-phases.md` D21 for why these two keep the viewport-as-project-name convention until the first golden-seeding phase decides otherwise). The `--project=<feature>-visual` commands below are the target shape once that split happens — remove this header once every `<feature>-visual` project exists and the two transitional viewport projects are gone (`../../checklist/general/documentation-practice.md` R007).

## Prerequisites

- `pnpm install` at the repo root.
- A fixture build — the visual suite never runs against the real build, since goldens need deterministic content (seeded fixtures, animations frozen at capture; see `structure.md`'s "Fixtures" section and `../../checklist/testing/visual-testing.md` R007).

## Intended test modes

| command | what it does |
|---|---|
| `pnpm test:visual` | **Real today.** Fixture build then both transitional viewport projects (`1512x945`/`1920x1080`) against `tests/visual/identical.spec.ts` + `adversarial-fixtures.spec.ts` — the whole bulk-imported golden set, not yet split per feature. |
| `pnpm exec playwright test --project=<feature>-visual` | **Not yet real** — runs one feature's golden comparisons against its fixture build, once that feature's recipes have moved out of the transitional viewport projects. |
| `pnpm exec playwright test --project="*-visual"` | **Not yet real** — runs every feature's visual project, same caveat. |
| `pnpm exec playwright test --project=<feature>-visual --update-snapshots` | **Not yet real**, same caveat. Rebaselines one feature's goldens — **only** in the same change as a deliberate visual change (see below), never before that split exists. |

## Rebaselining — the procedure, not just the flag

Never rebaseline to make a refactor's diff pass — a diff on a change advertised as "no behavior change" is a regression to find and fix, not a snapshot to update (`../../checklist/testing/visual-testing.md` R005). When a change *does* deliberately alter what a feature renders:

1. Build that feature's fixtures and update its goldens in the same commit as the rendering change:
   ```sh
   pnpm exec playwright test --project=<feature>-visual --update-snapshots
   ```
2. Run that feature's visual project **three consecutive times** and confirm all three pass clean — a golden that only passes intermittently after `--update-snapshots` baked in something non-deterministic (a live measurement, an un-flushed timer, GPU rasterization jitter), and the fix is to root-cause that non-determinism, not to re-run `--update-snapshots` until it happens to stick.
3. Visually inspect every changed `.png` yourself — not just the byte diff — for rendering defects a passing pixel-count threshold wouldn't catch (see `../../checklist/tech-stack/playwright.md` R011 on reading a diff image).
4. Never hand-edit a golden PNG (`../../checklist/testing/visual-testing.md` R006).

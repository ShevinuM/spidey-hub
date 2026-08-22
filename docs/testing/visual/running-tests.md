# Running the visual tests

> **Status: target command contract, not yet real.** Same caveat as `../e2e/running-tests.md` — this repo has no `package.json`/`playwright.config.ts` yet. Remove this header once the scaffold implements the commands below (`../../checklist/general/documentation-practice.md` R007).

## Prerequisites

- `pnpm install` at the repo root.
- A fixture build — the visual suite never runs against the real build, since goldens need deterministic content (seeded fixtures, animations frozen at capture; see `structure.md`'s "Fixtures" section and `../../checklist/testing/visual-testing.md` R007).

## Intended test modes

| command | what it does |
|---|---|
| `pnpm exec playwright test --project=<feature>-visual` | Runs one feature's golden comparisons against its fixture build. |
| `pnpm exec playwright test --project="*-visual"` | Runs every feature's visual project. |
| `pnpm exec playwright test --project=<feature>-visual --update-snapshots` | Rebaselines one feature's goldens — **only** in the same change as a deliberate visual change (see below). |

## Rebaselining — the procedure, not just the flag

Never rebaseline to make a refactor's diff pass — a diff on a change advertised as "no behavior change" is a regression to find and fix, not a snapshot to update (`../../checklist/testing/visual-testing.md` R005). When a change *does* deliberately alter what a feature renders:

1. Build that feature's fixtures and update its goldens in the same commit as the rendering change:
   ```sh
   pnpm exec playwright test --project=<feature>-visual --update-snapshots
   ```
2. Run that feature's visual project **three consecutive times** and confirm all three pass clean — a golden that only passes intermittently after `--update-snapshots` baked in something non-deterministic (a live measurement, an un-flushed timer, GPU rasterization jitter), and the fix is to root-cause that non-determinism, not to re-run `--update-snapshots` until it happens to stick.
3. Visually inspect every changed `.png` yourself — not just the byte diff — for rendering defects a passing pixel-count threshold wouldn't catch (see `../../checklist/tech-stack/playwright.md` R011 on reading a diff image).
4. Never hand-edit a golden PNG (`../../checklist/testing/visual-testing.md` R006).

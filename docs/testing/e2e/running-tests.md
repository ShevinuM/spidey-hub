# Running the e2e tests

> **Status: partially real (pre-phase, 2026-08-29).** `package.json`/`playwright.config.ts` exist and the commands below run today. `--project=smoke` is real (`tests/ui/smoke/`). Per-feature `--project=<feature>`/`--project=<feature>-visual` projects don't exist yet — no feature has moved out of the bulk-imported legacy tree — until then, that tree's own specs run under the **transitional** `legacy-1512x945`/`legacy-1920x1080` projects (two projects, one per viewport, both `testDir: tests/e2e`; see `Instructions/00-phases.md` D6 and `Instructions/01-pre-phase/PLAN.md` step 9 for why the plural is one `legacy` tier split by viewport rather than one project) — `legacy-*` is deleted once the last feature phase empties it (phase 11). Update this table as each feature phase adds its own project entries; remove this header once `legacy-*` is gone (`../checklist/general/documentation-practice.md` R007).

There's no backend, database, or login flow in this app — every command below runs against a real (or fixture) static build, not a seeded environment.

## Prerequisites

- `pnpm install` at the repo root.
- `pnpm build` for a real build (e2e/smoke), or the fixture-build equivalent for visual tests (see `../checklist/testing/visual-testing.md` for why visual needs its own build).

## Intended test modes

| command | what it does |
|---|---|
| `pnpm test:e2e` | Real build then `playwright test tests/e2e` — today this runs the **transitional** `legacy-1512x945`/`legacy-1920x1080` projects (every bulk-imported spec, at both viewports — v1's own historical behavior, pinned). |
| `pnpm test:visual` | Fixture build then the two viewport-named visual projects (`1512x945`/`1920x1080`) against `tests/visual/identical.spec.ts` + `adversarial-fixtures.spec.ts`. |
| `pnpm exec playwright test --project=smoke` | Runs only the root smoke tier (`tests/ui/smoke/`) — broad, shallow, cross-feature checks. This is the pre-merge gate. Real. |
| `pnpm exec playwright test --project=<feature>` | **Not yet real** — runs one feature's own e2e project (its `tests/ui/e2e/**` specs) once that feature has moved out of `legacy-*`. |
| `pnpm exec playwright test --project=<feature>-visual` | **Not yet real** — runs one feature's visual recipes against the fixture build, same caveat. |
| `pnpm exec playwright test` (no `--project`) | Runs every project — the full suite (today: `smoke` + both `legacy-*` + both viewport visual projects). |
| `pnpm exec playwright test --headed` | Any of the above, with a visible browser window. |
| `pnpm exec playwright test --ui` | Opens Playwright's interactive UI — step through tests, time-travel through actions, re-run as you edit spec files. |

`pnpm test:e2e`/`pnpm test:visual` are the short aliases this section originally asked for once `package.json` existed — they now exist (`package.json`'s own `scripts`). No `test:e2e:smoke`/`test:e2e:<feature>` aliases exist yet; add them here the moment they do, per this checklist's own documentation-practice rules.

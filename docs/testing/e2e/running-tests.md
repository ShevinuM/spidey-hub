# Running the e2e tests

> **Status: partially real.** `package.json`/`playwright.config.ts` exist and the commands below run today. `--project=smoke` is real (`tests/ui/smoke/`). Three contexts have moved their own specs out of the bulk-imported legacy tree so far — `common`, `profile`, and `help` — each as its own `--project=<context>-<viewport>` pair; every other feature's specs still run under the **transitional** `legacy-1512x945`/`legacy-1920x1080` projects (two projects, one per viewport, both `testDir: tests/e2e`) — `legacy-*` shrinks as each remaining feature phase moves its own specs out, and is deleted once the last one empties it. Update this table as each feature phase adds its own project entries; remove this header once `legacy-*` is gone (`../checklist/general/documentation-practice.md` R007).

There's no backend, database, or login flow in this app — every command below runs against a real (or fixture) static build, not a seeded environment.

## Prerequisites

- `pnpm install` at the repo root.
- `pnpm build` for a real build (e2e/smoke), or the fixture-build equivalent for visual tests (see `../checklist/testing/visual-testing.md` for why visual needs its own build).

## Intended test modes

| command | what it does |
|---|---|
| `pnpm test:e2e` | Real build then `playwright test --project=smoke --project=legacy-1512x945 --project=legacy-1920x1080 --project=common-1512x945 --project=common-1920x1080 --project=profile-1512x945 --project=profile-1920x1080 --project=help-1512x945 --project=help-1920x1080` — the transitional legacy tiers plus every feature that has moved its specs out so far. |
| `pnpm test:visual` | Fixture build then the shared/legacy visual specs plus every split-out `<context>-visual-<viewport>` project (see `../visual/running-tests.md`) plus the `profile-harness` and `help-harness` functional (non-golden) projects. |
| `pnpm exec playwright test --project=smoke` | Runs only the root smoke tier (`tests/ui/smoke/`) — broad, shallow, cross-feature checks. This is the pre-merge gate. Real. |
| `pnpm exec playwright test --project=common-1512x945 --project=common-1920x1080` | Real — runs `common`'s kernel+editor e2e specs (`common/tests/ui/e2e/`). |
| `pnpm exec playwright test --project=profile-1512x945 --project=profile-1920x1080` | Real — runs the `profile` feature's e2e specs (`src/features/profile/tests/ui/e2e/`). |
| `pnpm exec playwright test --project=help-1512x945 --project=help-1920x1080` | Real — runs the `help` feature's e2e specs (`src/features/help/tests/ui/e2e/`: `help.spec.ts`, `help-layout.spec.ts`, `help-search.spec.ts`). |
| `pnpm exec playwright test --project=<feature>-1512x945 --project=<feature>-1920x1080` | **Not yet real for the remaining features** (boot, notifications, dashboard, employment, repositories, grep, shell-fs) — runs one feature's own e2e project once that feature has moved out of `legacy-*`. There is no bare `<feature>` project name — Playwright projects are 1:1 with one `use`/viewport config, so each context/feature is always the two viewport-suffixed projects above, passed as two `--project` flags (verified with `--list`: `--project=profile` / `--project=common` both error `Project(s) "..." not found` even though those exact features have already moved). |
| `pnpm exec playwright test --project=<feature>-visual-1512x945 --project=<feature>-visual-1920x1080` | **Not yet real for the remaining features** — runs one feature's visual recipes against the fixture build, same caveat and same no-bare-alias rule (see `../visual/running-tests.md`). |
| `pnpm exec playwright test` (no `--project`) | Runs every project — the full suite. |
| `pnpm exec playwright test --headed` | Any of the above, with a visible browser window. |
| `pnpm exec playwright test --ui` | Opens Playwright's interactive UI — step through tests, time-travel through actions, re-run as you edit spec files. |

`pnpm test:e2e`/`pnpm test:visual` are the short aliases this section originally asked for once `package.json` existed — they now exist (`package.json`'s own `scripts`). No `test:e2e:smoke`/`test:e2e:<feature>` aliases exist yet; add them here the moment they do, per this checklist's own documentation-practice rules.

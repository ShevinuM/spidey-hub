# Running the e2e tests

> **Status: target command contract, not yet real.** This repo has no `package.json`/`playwright.config.ts` yet — the scaffold under `e2e/` is being built out to implement exactly this contract. Nothing below should be assumed to run until the scaffold catches up; when it does, this header is the first thing to remove (see `../checklist/general/documentation-practice.md` R007).

There's no backend, database, or login flow in this app — every command below runs against a real (or fixture) static build, not a seeded environment.

## Prerequisites

- `pnpm install` at the repo root.
- `pnpm build` for a real build (e2e/smoke), or the fixture-build equivalent for visual tests (see `../checklist/testing/visual-testing.md` for why visual needs its own build).

## Intended test modes

| command | what it does |
|---|---|
| `pnpm exec playwright test --project=smoke` | Runs only the root smoke tier — broad, shallow, cross-feature checks. This is the pre-merge gate. |
| `pnpm exec playwright test --project=<feature>` | Runs one feature's own e2e project (its `tests/ui/e2e/**` specs). |
| `pnpm exec playwright test --project=<feature>-visual` | Runs one feature's visual recipes against the fixture build. |
| `pnpm exec playwright test` (no `--project`) | Runs every project — the full suite. |
| `pnpm exec playwright test --headed` | Any of the above, with a visible browser window. |
| `pnpm exec playwright test --ui` | Opens Playwright's interactive UI — step through tests, time-travel through actions, re-run as you edit spec files. |

Once `package.json` exists, these are expected to get short aliases (`pnpm test:e2e:smoke`, `pnpm test:e2e:<feature>`, ...) rather than staying raw `playwright test --project=...` invocations — record the actual script names here the moment they're added, per this checklist's own documentation-practice rules.

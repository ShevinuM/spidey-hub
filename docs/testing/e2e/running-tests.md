# Running the e2e tests

There's no backend, database, or login flow in this app — every command below runs against a real (or fixture) static build, not a seeded environment.

## Prerequisites

- `pnpm install` at the repo root.
- `pnpm build` for a real build (e2e/smoke), or the fixture-build equivalent for visual tests (see `../checklist/testing/visual-testing.md` for why visual needs its own build).

## Intended test modes

| command | what it does |
|---|---|
| `pnpm test:e2e` | Real build then `playwright test --project=smoke --project=common-1512x945 --project=common-1920x1080 --project=profile-1512x945 --project=profile-1920x1080 --project=help-1512x945 --project=help-1920x1080 --project=boot-1512x945 --project=boot-1920x1080 --project=notifications-1512x945 --project=notifications-1920x1080 --project=dashboard-1512x945 --project=dashboard-1920x1080 --project=employment-1512x945 --project=employment-1920x1080 --project=repositories-1512x945 --project=repositories-1920x1080 --project=grep-1512x945 --project=grep-1920x1080 --project=shell-fs-1512x945 --project=shell-fs-1920x1080` — every context/feature's own project, now that the bulk-imported `legacy-*` tree (phase 11) has fully emptied and been deleted. |
| `pnpm test:visual` | Fixture build then the shared/context/feature visual specs (see `../visual/running-tests.md`) plus the `profile-harness`, `help-harness`, `boot-harness`, `notifications-harness`, `dashboard-harness`, `employment-harness`, `repositories-harness`, `grep-harness`, and `shell-fs-harness` functional (non-golden) projects. |
| `pnpm exec playwright test --project=smoke` | Runs only the root smoke tier (`tests/ui/smoke/`) — broad, shallow, cross-feature checks. This is the pre-merge gate. Real. |
| `pnpm exec playwright test --project=common-1512x945 --project=common-1920x1080` | Real — runs `common`'s kernel+editor e2e specs (`src/common/tests/ui/e2e/`). |
| `pnpm exec playwright test --project=profile-1512x945 --project=profile-1920x1080` | Real — runs the `profile` feature's e2e specs (`src/features/profile/tests/ui/e2e/`). |
| `pnpm exec playwright test --project=help-1512x945 --project=help-1920x1080` | Real — runs the `help` feature's e2e specs (`src/features/help/tests/ui/e2e/`: `help.spec.ts`, `help-layout.spec.ts`, `help-search.spec.ts`). |
| `pnpm exec playwright test --project=boot-1512x945 --project=boot-1920x1080` | Real — runs the `boot` feature's e2e specs (`src/features/boot/tests/ui/e2e/`: `boot.spec.ts`, `cold-boot.spec.ts`). |
| `pnpm exec playwright test --project=notifications-1512x945 --project=notifications-1920x1080` | Real — runs the `notifications` feature's e2e specs (`src/features/notifications/tests/ui/e2e/`: `notifications.spec.ts`, `notifications-boot.spec.ts`, `toast-drain-arm.spec.ts`). |
| `pnpm exec playwright test --project=dashboard-1512x945 --project=dashboard-1920x1080` | Real — runs the `dashboard` feature's e2e specs (`src/features/dashboard/tests/ui/e2e/`: `dashboard.spec.ts`). |
| `pnpm exec playwright test --project=employment-1512x945 --project=employment-1920x1080` | Real — runs the `employment` feature's e2e specs (`src/features/employment/tests/ui/e2e/`: `employment.spec.ts`, `employment-layout.spec.ts`). |
| `pnpm exec playwright test --project=repositories-1512x945 --project=repositories-1920x1080` | Real — runs the `repositories` feature's e2e specs (`src/features/repositories/tests/ui/e2e/`: `repositories.spec.ts`, `repositories-preview-highlight.spec.ts`, `repositories-preview-scroll.spec.ts`, `repositories-status-dots.spec.ts`). |
| `pnpm exec playwright test --project=grep-1512x945 --project=grep-1920x1080` | Real — runs the `grep` feature's e2e specs (`src/features/grep/tests/ui/e2e/`: `grep.spec.ts`). |
| `pnpm exec playwright test --project=shell-fs-1512x945 --project=shell-fs-1920x1080` | Real — runs the `shell-fs` feature's e2e specs (`src/features/shell-fs/tests/ui/e2e/`: `shell.spec.ts`). |
| `pnpm exec playwright test --project=<feature>-visual-1512x945 --project=<feature>-visual-1920x1080` | Runs one feature's visual recipes against the fixture build (see `../visual/running-tests.md`). There is no bare `<feature>-visual` project name — Playwright projects are 1:1 with one `use`/viewport config, so each context/feature is always the two viewport-suffixed projects, passed as two `--project` flags. |
| `pnpm exec playwright test` (no `--project`) | Runs every project — the full suite. |
| `pnpm exec playwright test --headed` | Any of the above, with a visible browser window. |
| `pnpm exec playwright test --ui` | Opens Playwright's interactive UI — step through tests, time-travel through actions, re-run as you edit spec files. |

`pnpm test:e2e`/`pnpm test:visual` are the short aliases this section originally asked for once `package.json` existed — they now exist (`package.json`'s own `scripts`).

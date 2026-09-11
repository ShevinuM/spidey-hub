# Running the visual tests

> **Status: partially real.** `package.json`/`playwright.config.ts` exist; `pnpm test:visual` runs today against a mix of the **transitional** viewport-named projects (`1512x945`/`1920x1080`, `testDir: tests/visual` — the bulk-imported recipes no context/feature has claimed yet) and the real per-context/per-feature splits that exist so far: `common-visual-<viewport>`, `profile-visual-<viewport>`, `help-visual-<viewport>`, and `boot-visual-<viewport>`. Each split project sets its own `snapshotPathTemplate` with the viewport hardcoded as a literal (not derived from `{projectName}`, since a split project's name carries a context/feature prefix) — recorded in full in `Instructions/01-pre-phase/recipe-feature-map.md`. The two transitional viewport projects keep the original root-level template unchanged, since their `{projectName}` is still exactly the viewport. Remove this header once every feature has its own `<feature>-visual` project and the two transitional viewport projects are empty (`../../checklist/general/documentation-practice.md` R007).

## Prerequisites

- `pnpm install` at the repo root.
- A fixture build — the visual suite never runs against the real build, since goldens need deterministic content (seeded fixtures, animations frozen at capture; see `structure.md`'s "Fixtures" section and `../../checklist/testing/visual-testing.md` R007).

## Intended test modes

| command | what it does |
|---|---|
| `pnpm test:visual` | **Real today.** Fixture build then the two transitional viewport projects (`1512x945`/`1920x1080`) against `tests/visual/identical.spec.ts` + `adversarial-fixtures.spec.ts`, plus `common/tests/ui/visual/identical.spec.ts` (`common-visual-<viewport>`), plus `src/features/profile/tests/ui/visual/identical.spec.ts` (`profile-visual-<viewport>`), plus `src/features/profile/tests/ui/harness/profile.spec.ts` (`profile-harness` — functional-only, no goldens, riding along on the same fixture build since it needs one too), plus `src/features/help/tests/ui/visual/identical.spec.ts` (`help-visual-<viewport>`), plus `src/features/help/tests/ui/harness/help.spec.ts` (`help-harness` — functional-only, no goldens), plus `src/features/boot/tests/ui/visual/identical.spec.ts` (`boot-visual-<viewport>`), plus `src/features/boot/tests/ui/harness/boot.spec.ts` (`boot-harness` — functional-only, no goldens). |
| `pnpm exec playwright test --project=common-visual-1512x945 --project=common-visual-1920x1080` | Real — runs just `common`'s split-out recipes against `common/tests/ui/visual/goldens/`. |
| `pnpm exec playwright test --project=profile-visual-1512x945 --project=profile-visual-1920x1080` | Real — runs just `profile`'s split-out recipe against `src/features/profile/tests/ui/visual/goldens/`. |
| `pnpm exec playwright test --project=profile-harness` | Real — runs the `profile` feature's harness spec (mount + core interactions, no goldens) against the fixture build's `/harness/profile` route. |
| `pnpm exec playwright test --project=help-visual-1512x945 --project=help-visual-1920x1080` | Real — runs just `help`'s split-out recipes (`11-help`, `20-help-search`) against `src/features/help/tests/ui/visual/goldens/`. |
| `pnpm exec playwright test --project=help-harness` | Real — runs the `help` feature's harness spec (mount + core interactions, no goldens) against the fixture build's `/harness/help` route. |
| `pnpm exec playwright test --project=boot-visual-1512x945 --project=boot-visual-1920x1080` | Real — runs just `boot`'s split-out recipes (`13-boot-mid`, `14-boot-ready`, captured via `captureBootState()`) against `src/features/boot/tests/ui/visual/goldens/`. |
| `pnpm exec playwright test --project=boot-harness` | Real — runs the `boot` feature's harness spec (mount + core interactions, no goldens) against the fixture build's `/harness/boot` route. |
| `pnpm exec playwright test --project=<feature>-visual-1512x945 --project=<feature>-visual-1920x1080` | **Not yet real for the remaining features** (notifications, dashboard, employment, repositories, grep, shell-fs) — runs one feature's golden comparisons against its fixture build, once that feature's recipes have moved out of the transitional viewport projects. There is no bare `<feature>-visual` project name — Playwright projects are 1:1 with one `use`/viewport config, so each context/feature is always the two viewport-suffixed projects, passed as two `--project` flags (verified with `--list`: `--project=common-visual` / `--project="*-visual"` both error `Project(s) "..." not found`/`No projects matched` — there's no glob support and no un-suffixed alias). |
| `pnpm exec playwright test --project=<feature>-visual-1512x945 --project=<feature>-visual-1920x1080 --update-snapshots` | Rebaselines one feature's goldens — **only** in the same change as a deliberate visual change (see below). Real for `common`/`profile`/`help`/`boot` (as the two viewport-suffixed project names above); **not yet real** for the remaining features until each settles its own split. |

## Rebaselining — the procedure, not just the flag

Never rebaseline to make a refactor's diff pass — a diff on a change advertised as "no behavior change" is a regression to find and fix, not a snapshot to update (`../../checklist/testing/visual-testing.md` R005). When a change *does* deliberately alter what a feature renders:

1. Build that feature's fixtures and update its goldens in the same commit as the rendering change:
   ```sh
   pnpm exec playwright test --project=<feature>-visual-1512x945 --project=<feature>-visual-1920x1080 --update-snapshots
   ```
2. Run that feature's visual project **three consecutive times** and confirm all three pass clean — a golden that only passes intermittently after `--update-snapshots` baked in something non-deterministic (a live measurement, an un-flushed timer, GPU rasterization jitter), and the fix is to root-cause that non-determinism, not to re-run `--update-snapshots` until it happens to stick.
3. Visually inspect every changed `.png` yourself — not just the byte diff — for rendering defects a passing pixel-count threshold wouldn't catch (see `../../checklist/tech-stack/playwright.md` R011 on reading a diff image).
4. Never hand-edit a golden PNG (`../../checklist/testing/visual-testing.md` R006).

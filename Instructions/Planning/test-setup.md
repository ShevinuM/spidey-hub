# Pre-migration test setup

> **Status: working plan, not yet executed.** Nothing under `features/`/`common/`/`bootstrap/` exists yet — this describes the order of operations for standing up tests *before* code moves, per `docs/checklist/general/documentation-practice.md` R007.

## Goal

Set up the test suites feature-by-feature, ahead of migrating each feature's actual source, so every feature has a green safety net (unit + e2e + visual) *before* its code is touched — not written after, as an afterthought once the rewrite is "done."

## The two baseline datasets — only one is a real comparison baseline

Two screenshot sets exist in v1, and they serve different jobs:

| dataset | shape | usable as a v2 parity baseline? |
|---|---|---|
| `docs/screenshots/*.png` (12 images) | real content — live clock, real contribution data, non-deterministic | **No** — human reference material only, not byte-comparable |
| `tests/visual/goldens/**` (42 PNGs: 21 recipes × 2 viewports) | fixture-driven, deterministic, animations frozen at capture | **Yes** — this is the real pre-migration baseline |

Every feature's v2 visual suite (`docs/checklist/testing/visual-testing.md`) starts from that feature's slice of v1's `tests/visual/goldens/`, seeded as the starting goldens before any code moves. Parity is only valid under matching capture conditions: **same Playwright version as v1 (`1.62.1`, exact-pinned per `docs/checklist/general/toolchain.md` R002), same two viewports, same fixture data, animations disabled at capture time.** A different Chromium build invalidates the comparison before it starts — pin first, migrate second. Upgrading the pin later is a deliberate, separate rebaseline, not something to do mid-migration.

This also means: v1's shared top-level `fixtures/` needs splitting into per-feature fixture sets before goldens can be seeded per feature (`testing/visual-testing.md` R003 already requires feature-local fixtures) — that's a Phase 0 task, not something each feature does independently and inconsistently.

## Phase 0 — scaffold once, before any feature migrates

1. `package.json` + root `playwright.config.ts`, with the `projects` array from `docs/checklist/testing/e2e-testing.md` R016–R017: `smoke` (root, broad/shallow) + one project per feature, plus a visual project per feature on the fixture build.
2. Port v1's shared e2e fixture (`tests/e2e/fixtures.ts` / `contentFixtures.ts`) into `common/tests/ui/support/`, fixing its `../../src/lib/*` imports to their new v2 locations as part of the move (see "Mechanical import breakage" below — this one file fixes itself once, and every spec that only depends on it inherits the fix for free).
3. Split v1's `fixtures/` directory into per-feature fixture sets under each feature's own `tests/` (or `content/fixtures/`), per `testing/visual-testing.md` R003.
4. Seed each feature's `tests/ui/visual/goldens/` from its slice of v1's `tests/visual/goldens/`, unchanged, as the starting baseline.

## Per-feature migration loop

For each feature, in this order — **don't refactor tests and migrate code in the same step**:

1. **Port that feature's specs verbatim** into `features/<feature>/tests/ui/e2e/` and `tests/ui/visual/` — mechanical import-path fixes only (see below), no behavioral rewrites, no locator-style changes yet.
2. **Migrate the feature's actual source** (`components/`, `lib/`, `content/`) into its `features/<feature>/` folder.
3. **Get that feature's Playwright project green** (`playwright test --project=<feature>`) against the migrated code.
4. **Confirm goldens byte-match** the seeded v1 baseline — a diff here means the migration wasn't pure (see `testing/visual-testing.md` R005), not something to rebaseline away.
5. **Only then**, as a separate, test-verified step: refactor the ported specs to the checklist's actual conventions (page-object model, `getByTestId` instead of raw `page.locator('[data-testid=...]')`, etc. — `docs/checklist/testing/e2e-testing.md`, `tech-stack/playwright.md`).

Until step 5 lands for a given feature, its ported specs are **exempt** from the POM/locator rules in `e2e-testing.md`/`playwright.md` — a safety net you're simultaneously rewriting while depending on it to catch migration bugs isn't a safety net. Track this exemption per feature and close it out once step 5 is done; don't let it become permanent.

Suggested order: smallest/least-coupled feature first (`profile` or `help` — no `editor` dependency, minimal kernel coupling) to prove the loop mechanically, kernel-bucket last (see mapping below — it's the largest and most cross-cutting).

## Spec-to-feature mapping (all 30 of v1's current specs)

| feature | specs |
|---|---|
| `repositories` | `repositories.spec.ts`, `repositories-preview-highlight.spec.ts`, `repositories-preview-scroll.spec.ts`, `repositories-status-dots.spec.ts` |
| `employment` | `employment.spec.ts`, `employment-layout.spec.ts` |
| `help` | `help.spec.ts`, `help-layout.spec.ts`, `help-search.spec.ts` |
| `notifications` | `notifications.spec.ts`, `notifications-boot.spec.ts`, `toast-drain-arm.spec.ts` |
| `boot` | `boot.spec.ts`, `cold-boot.spec.ts` |
| `dashboard` | `dashboard.spec.ts` |
| `profile` | `profile.spec.ts` |
| `grep` | `grep.spec.ts` |
| `shell-fs` | `shell.spec.ts` |
| `common` (editor) | `editor-vim.spec.ts`, `editor-cursor-visibility.spec.ts` — editor is shared by `repositories` + `employment`, not owned by either |
| **kernel / root** | `terminal.spec.ts`, `tmux.spec.ts`, `panes.spec.ts`, `sessions.spec.ts`, `choose-tree.spec.ts`, `copy-mode.spec.ts`, `cmdline.spec.ts`, `nav.spec.ts`, `panel-badge.spec.ts`, `animations.spec.ts` |

The kernel bucket is both the largest (10 specs) and the most coupled to everything else (it's the host every feature plugs into) — migrate it last, once every feature project is already green, not first.

## Will restructuring break the e2e tests? Three different answers, not one

**1. Mechanical import breakage — real, but scriptable.** ~15 of the 30 specs (plus the shared `fixtures.ts`) import constants or pure helpers directly from `src/lib/*.ts` for computing expected values against the same logic the app uses — `BOOT_SEEN_STORAGE_KEY`, `TOAST_DURATION_MS`, `NOTIFICATIONS_INJECT_SEED_STORAGE_KEY` (from `bootState.ts`/`notificationStore.ts`), `formatCtime` (`clock.ts`), `search`/`formatCount` (`grep.ts`), `mulberry32`/`pickRandomUnseen` (`notificationStore.ts`). Every one of these breaks the moment its module moves to `common/lib/`, `common/engines/`, or a feature's own `lib/`. This is a deliberate pattern worth keeping (single source of truth for expected values, not duplicated magic strings in test code) — the fix is a path rewrite, not a design change. Once specs live inside `features/<feature>/tests/ui/e2e/`, most of these imports actually get *shorter* (a relative path to that feature's own `lib/`, not a `../../src/lib/` reach-across) — the restructure simplifies this class of coupling more than it breaks it.

**2. Behavioral breakage — real, and specific to `grep` and `shell-fs`.** These two features' entire output *is* the repository's own file tree — `grep-index.json`/`fs-index.json` are generated by walking `src/`, `scripts/`, `tests/` (see `scripts/generate.mjs`'s `GREP_ROOT_SUBDIRS`/`FS_INDEX_SUBDIRS`). Restructuring the source tree changes what the product actually displays, so literal assertions — `rowByPath(page, "src/lib/grep.ts")`, `toHaveAttribute("data-path", "src/components/repositories/Repositories.svelte")` — break for a real product reason, not a test-fragility reason. The fix ships as part of migrating those two features specifically: update the generator's root-subdir lists to the new tree, then rewrite the literal path assertions in `grep.spec.ts`/`shell.spec.ts` to match.

**3. No breakage at all — everything else.** Every spec's actual assertions run through testids, ARIA roles, keymaps, and UI text — none of which change because a file moved from `src/components/repositories/` to `features/repositories/components/`. Routes stay the same, `data-testid` values stay the same (see `general/files-and-naming.md` R014's prefix convention), keyboard shortcuts stay the same. The UI contract survives a file reorganization; only the import paths pointing at internals don't.

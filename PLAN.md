# PLAN — Iteration 4: batch of 22 small UI/UX fixes

## Objective

Land all 22 distinct fixes from the user's numbered list (items 1–25; 8=22, and several merge) across the tmux-style portfolio site, batched into 3 execution waves, with the full test suite (check, unit, e2e, visual) green and goldens re-baselined at the end.

## Context

- Stack: Astro 7 + Svelte 5 (runes), Tailwind 4, Playwright e2e + pixel-identical visual goldens (`tests/visual/identical.spec.ts`, re-baselined via `--update-snapshots`).
- Research (2 researcher reports, file:line-verified at HEAD af83aeb) mapped every item. Key facts:
  - Personnel rows: `Personnel.svelte:574-593`; icons/`{n} roles` template from `src/data/personnel.yaml` (`companyRowIcon: "▸"`, `roleCountTemplate: "{n} {word}"`).
  - `../` row is hardcoded OUTSIDE the selectable `filteredRows` (`Personnel.svelte:594-608`) → keyboard can never reach it. Filter box wiring looks coherent (enter via `f` or click); defect must be reproduced at runtime.
  - Personnel full-path breadcrumb: `data-testid="personnel-path"` at `Personnel.svelte:564-569` (`/Users/Shev/Experience/...`).
  - Preview-of-directory renders leaf roles in a 3-col grid that wraps (`Personnel.svelte:644-653`).
  - Builds Files pane is cwd-based (`repoTree.ts:40-63`, `Builds.svelte:174-179, 215-223, 415-426`), with `../` entry; NOT an expand/collapse tree.
  - Local Repositories: `all-projects` appended LAST (`Builds.svelte:93-102`), `selectedRepoIdx=0` selects first real repo.
  - Dashboard "B" block cursor: data-driven `invert: "B"` in `src/data/dashboard.yaml:22-26`, rendered `Dashboard.svelte:96-98`.
  - Editor statusline breadcrumb span (`Editor.svelte:833-857`) has no nowrap/truncation → wraps to 2 lines.
  - Page chrome: each view renders its own outer "window card" (border+radius+shadow): `Dashboard.svelte:52`, `Builds.svelte:743`, `Personnel.svelte:558`, `HelpView.svelte:46`, `Profile.svelte:55`. Wallpaper blur/darken knobs: `Wallpaper.svelte:41,48` (`wallOpacity`, `wallFilter`); status bar is a 30px sibling (`layout.ts:7`).
  - SPIDEY-HUB: per-char arched text in self-hosted "Webslinger" font (the classic Spider-Man font, `global.css:17-29`), red fill, inside a bordered plate (`Dashboard.svelte:55-66`).
  - Toasts: inline in flex flow (push content down), manual ✕ only, no auto-dismiss (`Toasts.svelte:49-106`, mounted `Terminal.svelte:1759-1767`).
  - "add ! to override": copy-only, `src/data/builds.yaml:155` + `src/data/personnel.yaml:81`; `w!`/`wq!` fall through to E492 unknown (`cmdline.ts:153-158`).
  - Help content is pure data `src/data/help.yaml` (18 sections); long paragraph rows at lines ~93,103,105,123,132,308,312,322,327.
  - `Ctrl-b c` is unhandled (`Terminal.svelte:1264-1406`); `tmux.ts` has `createSession` but no `createWindow`.
  - Shell has no `vim` command (`shell.ts:404-571`); Builds/Personnel open the Editor via local component state.
  - Profile: separate `profile-summary` and `profile-dossier` boxes (`Profile.svelte:122-139`); dossier already has 4 paragraph divs (spacing likely missing visually).

### Assumptions (stated so they can be checked, not improvised around)

1. Item 7 "full path above" = the `personnel-path` breadcrumb label. Remove it.
2. Item 14 "bar cannot flow into two lines" = the Editor statusline; item 20 "cursor on builds" = the `invert: "B"` block on the Dashboard menu (screenshots were swapped in the recovered list; both fixes are wanted regardless).
3. Item 2's `ls -l` columns: `permissions  owner(shev)  date  name` with name LAST (rightmost column), `/`-suffixed dirs, `drwxr-xr-x` for dirs and `.rw-r--r--` for files; date = role start date (or plausible fixed date for dirs). Preview of a directory lists its immediate children, like the reference image.
4. Item 11 "floating window" = the OUTER window-card chrome (border, radius, drop shadow, inset margins) on the five view components. Inner tmux-pane borders/titles stay.
5. Item 12: notifications become a fixed overlay anchored bottom-right just above the status bar, tmux `display-message` styling (amber bg, dark text, one-line strip), auto-dismiss ~4s, no ✕, no layout shift.
6. Item 16: `Ctrl-b c` = tmux new-window semantics — creates a new window in the current session running the in-window shell program.
7. Item 24: remove the "j/k moves" hint text from personnel hints and the j/k row from help's personnel section. j/k keyboard behavior itself stays.
8. Item 13 (vim cursor disappears): no static-analysis defect found; executor must reproduce at runtime (Playwright) before fixing; if irreproducible, report with evidence rather than guess-fix.
9. Item 9: wallpaper behind windowed views gets blur + darken on ALL views except retina-v (where the map IS the content); status bar unaffected.
10. Commits: single-line messages, no body, no Co-Authored-By (user's standing preference). Orchestrator commits after each verified wave.

## Steps

### Wave 1 — two parallel executors, disjoint files

- [x] **1A. Personnel view** (owns: `src/components/Personnel.svelte`, `src/data/personnel.yaml`, `tests/e2e/personnel.spec.ts`)
  - Item 1: dir rows get a folder icon, role rows a file icon (nvim-tree/lazygit look). Nerd fonts are NOT bundled — use inline SVG icons (crisp, colorable) keyed off row type; keep yaml-driven text fallback out of the row.
  - Item 2: preview-of-directory becomes `ls -l`-style listing of the selected dir's immediate children: `drwxr-xr-x  shev  <date>  <name>/` per row (assumption 3), monospace-aligned columns.
  - Item 3: every personnel row (list + preview) is strictly one line: `white-space:nowrap` + `overflow:hidden;text-overflow:ellipsis` on flexible cells.
  - Item 6: no `../` row at root (root = company list level).
  - Item 7: delete the `personnel-path` breadcrumb label.
  - Item 23a: in subdirectories, `../` becomes a real first row in the selectable rows array — j/k reaches it, Enter goes up one level.
  - Item 23b: reproduce the filter box defect with Playwright (`pnpm build:fixtures` + preview, or dev server); fix it; typing after `f` (and clicking the prompt) must filter rows live. Also accept `/` to enter filter mode.
  - Item 24 (hint part): remove "j/k moves" from `personnel.yaml` hints templates.
  - Item 25: `roleCountTemplate: "{n}"` (drop the word).
  - Update `tests/e2e/personnel.spec.ts` to encode ALL the above (breadcrumb gone, `../` selectable in subdir + absent at root, one-line rows, `{n}` meta, filter works, ls-l preview shape).
- [x] **1B. Builds view + dashboard cursor + statusline** (owns: `src/components/Builds.svelte`, `src/lib/repoTree.ts`, `src/data/builds.yaml` [repoBrowser icons only], `src/data/dashboard.yaml`, `src/components/Dashboard.svelte` [invert rendering only], `src/components/Editor.svelte` [statusline block only], `tests/e2e/builds.spec.ts`, `tests/unit/*` for repoTree)
  - Item 4: rewrite the [2]-Files pane as a lazygit-style tree: full repo tree rendered nested with indentation, ALL dirs expanded by default, Enter (and click) on a dir toggles collapse/expand, Enter on a file opens the editor (unchanged), NO `../` entry. `repoTree.ts` gains a tree-build + flatten-visible helper (unit-testable, pure).
  - Item 1 (builds part): dirs get folder icon + ▾/▸ caret by expand state; files get file icon (same SVG set as 1A — duplicate the tiny snippet, do NOT share a new module to avoid cross-executor coupling).
  - Item 5: `all-projects` pinned FIRST in Local Repositories and selected by default (`selectedRepoIdx` default points at it; downstream Files pane must load all-projects tree on mount).
  - Item 20: remove `invert` key from `dashboard.yaml` and the `item.invert` branch in `Dashboard.svelte:96-98`.
  - Item 14: Editor statusline strictly one line — breadcrumb span gets `min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis` (truncate from the left is fine), statusline row `flex-wrap:nowrap`.
  - Update `tests/e2e/builds.spec.ts`: tree expanded by default, Enter toggles, no `../`, all-projects first+default, statusline single line (assert `clientHeight` of statusline < 2 lines or nowrap style).
- [x] **1V. Verify wave 1** (PASS 2026-08-18: check 0 errors, unit 291/291, e2e 862/862, diff inspection all items confirmed) — verifier runs `pnpm check`, `pnpm test:unit`, `pnpm build && npx playwright test tests/e2e/personnel.spec.ts tests/e2e/builds.spec.ts tests/e2e/editor-vim.spec.ts tests/e2e/nav.spec.ts` and greps the diff for each item's acceptance below. On PASS: orchestrator commits (single line).

### Wave 2 — two parallel executors (shared-file protocol: Terminal.svelte edits must be surgical `Edit` calls in the stated distinct regions; never `Write` the whole file)

- [ ] **2C. Chrome/visual** (owns: `src/components/Wallpaper.svelte`, `Terminal.svelte` [render-tree region ~1746-1826 only], `Toasts.svelte`, `src/lib/notifications.ts`, `src/data/notifications.yaml` [if needed], `Dashboard.svelte`, outer-card blocks of `Builds.svelte`/`Personnel.svelte`/`HelpView.svelte`, `Editor.svelte`+`CopyMode.svelte` [item 13 only], `tests/e2e/nav.spec.ts` toast assertions)
  - Item 9: wallpaper blurred AND darkened behind all views except retina-v (e.g. `wallFilter: blur(6px) brightness(.45)`); status bar stays crisp.
  - Item 11: remove the outer window-card chrome (border, border-radius, big drop shadow, inset margins) from Dashboard, Builds, Personnel, HelpView (Profile's card is 2D's). Views fill the pane edge-to-edge; inner pane borders/titles unchanged.
  - Item 10: remove the bordered plate around SPIDEY-HUB; restyle the wordmark to match the classic logo: white fill, red outline/stroke, dark offset shadow, keep Webslinger font + arch.
  - Item 12: notifications → fixed overlay, right-aligned, anchored just above the status bar (`bottom: STATUS_BAR_HEIGHT_PX + margin`), stacked upward; tmux display-message styling (amber bg, dark mono text, one-line strip); NO ✕ button; auto-dismiss after ~4s (respect fake-timer test compatibility: use `setTimeout` so Playwright `page.clock` can drive it); zero layout shift (PaneTree height must not change when toasts show/hide).
  - Item 13: attempt runtime repro of "j/k makes vim cursor disappear" across editor + copy-mode + views (Playwright). Fix root cause if found; if irreproducible after a genuine attempt, document exactly what was tried in the executor report.
  - Update/extend e2e: toast auto-dismiss + no dismiss button + overlay positioning (nav.spec.ts), dashboard wordmark plate gone.
- [ ] **2D. Cmdline/help/tmux/shell/profile** (owns: `src/lib/cmdline.ts`, `src/data/builds.yaml`+`personnel.yaml` [E45 lines only], `src/data/help.yaml`, `src/lib/helpSearch.ts` [only if needed], `src/lib/tmux.ts`, `Terminal.svelte` [handlePrefixedKey region ~1264-1406 only], `src/lib/shell.ts`, `src/data/shell.yaml`, `Shell.svelte`, `Profile.svelte`, `src/data/profile.yaml`, `tests/e2e/cmdline.spec.ts`, `editor-vim.spec.ts`, `tmux.spec.ts`, `shell.spec.ts`, `sessions.spec.ts`, `help.spec.ts`, `profile.spec.ts`)
  - Items 8/22: `writeReadonlyMessage` → `"E45: 'readonly' option is set"` (both yaml files); `parseExCommand` treats `w!`/`wq!` like `w`/`wq` (writeError) so no E492 confusion. No "add !" text remains anywhere (`grep -ri "override" src/` clean for this phrase).
  - Item 15: sweep `src/data/help.yaml` — every row description ≤ 1 concise line (e.g. detach → "detach tmux session"). For each row ask: is this a keymap? If not, is it genuinely useful? Drop pure prose rows. Keep `status: planned` rows as-is unless verbose.
  - Item 24 (help part): remove the j/k row from the personnel section of help.yaml.
  - Item 16: implement `Ctrl-b c` = new-window running the shell program: `createWindow()` in `tmux.ts` (pattern-match `splitPane`/`killWindow`), dispatch branch in `handlePrefixedKey`, window appears in status bar + choose-tree, add a 1-line help.yaml row. e2e test in tmux.spec.ts or sessions.spec.ts.
  - Item 19: `vim <file>` (accept `vi`/`nvim` aliases) shell builtin: resolves path against the shell fs index; opens the read-only Editor over the shell pane (reuse the Builds/Personnel local-state pattern inside Shell.svelte); `:q` returns to shell; missing file → vim-style error line; no arg → usage error. e2e test in shell.spec.ts.
  - Item 21: delete the summary section from `Profile.svelte` (and its yaml block if now unused); dossier paragraphs get visible spacing (margin between paragraph divs). Update profile.spec.ts.
  - Item 23c (carried from wave 1A): make `/` enter Personnel filter mode — one-line dispatch change in `Terminal.svelte` (consult the focused Personnel ref before GrepOverlay's `/`-opener at ~:1641, or widen the greedy gate). Flip the "KNOWN LIMITATION" test at `tests/e2e/personnel.spec.ts:637`, update `tests/e2e/grep.spec.ts:252` (asserted the old behavior) and fix the `personnel-path` references in `grep.spec.ts:117` + `cmdline.spec.ts:430` (breadcrumb was removed in 1A). grep.spec.ts and personnel.spec.ts (these tests only) added to 2D ownership.
  - Update all owned specs for changed copy/behavior.
- [ ] **2V. Verify wave 2** — verifier runs `pnpm check`, `pnpm test:unit`, `pnpm build && npx playwright test tests/e2e/` (full e2e — cheap enough once built), plus greps: no "add ! to override" anywhere; no multi-sentence help rows (spot check the named lines). On PASS: orchestrator commits.

### Wave 3 — single executor

- [ ] **3E. Test/goldens reconciliation** — fix any remaining red e2e specs (behavior changed in waves 1–2 that other specs assert), then re-baseline visual goldens: `pnpm build:fixtures && npx playwright test tests/visual/identical.spec.ts --update-snapshots`, then run the FULL suite: `pnpm check && pnpm test:unit && pnpm test:e2e && pnpm test:visual` — all green. Eyeball 3–4 updated goldens (dashboard, builds, personnel, help) to confirm they show the new look, not a blank/broken page.
- [ ] **3V. Final verify** — verifier re-runs the full suite from a clean state and checks the acceptance criteria list below. On PASS: orchestrator commits (and refreshes generated indexes if scripts/generate.mjs output changed).

## Verification (per item, checkable)

| Item | Check |
|---|---|
| 1 | Personnel + Builds rows render SVG folder/file icons (e2e: icon testid/svg present; no "▸" in row icon slot) |
| 2 | Preview of dir = ls-l rows, name last; e2e asserts row text matches `/^[.d][rwx-]{9}\s+shev\s+.+\s+\S+\/?$/`-ish shape |
| 3 | e2e: preview/list row `clientHeight` equals one line-height; nowrap style asserted |
| 4 | e2e: builds tree shows nested children immediately on load; Enter on dir collapses (children gone) and re-expands; no `../` row |
| 5 | e2e: first Local Repositories row is `all-projects` and is selected on load |
| 6 | e2e: at personnel root, no `../` row exists |
| 7 | e2e: `personnel-path` testid absent |
| 8/22 | grep: "add ! to override" absent from repo (src/); e2e: `:wq!` in editor yields E45 readonly message, not E492 |
| 9 | Wallpaper element has blur+brightness filter on builds/personnel/dashboard; not on retina-v (e2e style assertion) |
| 10 | Dashboard plate border element gone; wordmark has white fill + red stroke styling (e2e style assertion) |
| 11 | Outer card styles (box-shadow 0 24px 80px / outer border-radius) removed from the 5 views (grep + golden diff) |
| 12 | e2e with fake clock: toast visible at t0, gone after ~4s; no `toast-*-dismiss` testid; toasts container is position:fixed (no PaneTree height change) |
| 13 | Repro attempt documented; if fixed, regression e2e test exists |
| 14 | e2e: editor statusline height = one line with a long path (fixture repo has one) |
| 15/24 | help.yaml: every `description` ≤ ~90 chars, single sentence; no j/k row in personnel section; help.spec.ts green |
| 16 | e2e: `Ctrl-b c` creates a new window (status bar entry + shell prompt visible), the new window gets a sane index that coexists with prefix digit targets, is reachable via prefix digit and choose-tree, and dies cleanly via `Ctrl-b &`; help row exists |
| 19 | e2e: in shell, `vim <existing file>` opens editor with content; `:q` returns to shell; `vim nofile` → error line |
| 20 | dashboard.yaml has no `invert`; Dashboard.svelte has no invert branch; golden shows plain "Builds" |
| 21 | e2e: `profile-summary` testid absent; dossier paragraphs have inter-paragraph spacing |
| 23 | e2e: in a personnel subdir, j/k reaches `../` and Enter ascends; typing in filter mode narrows rows |
| 25 | e2e: personnel dir row meta is bare digits |

## Acceptance criteria (stop conditions)

- [ ] All 22 items pass their table checks above.
- [ ] `pnpm check`, `pnpm test:unit`, `pnpm test:e2e`, `pnpm test:visual` all green from a clean tree.
- [ ] Visual goldens re-baselined exactly once (wave 3); updated goldens eyeballed.
- [ ] No scope beyond the 22 items (no refactors, no new features, no dependency changes except assets needed for item 10 — none expected since Webslinger is already bundled).
- [ ] Work committed per wave, single-line messages, no Co-Authored-By.
- Out of scope: Memorial role end dates, resume/contact launch gaps, deploy.

# PLAN.md — Iteration 3: shell-behind-tmux, panes/layouts/choose-tree, help search, real data, Spidey-Hub

## Objective

Turn the site into a hyperreal tmux client: every window runs a "program" that can `:q` back to
an in-window shell; the client can detach (`Ctrl-b d`) to a host shell over the dim radar; real
panes (`Ctrl-b |`/`-`), all 7 tmux preset layouts (`Ctrl-b Space`), and `Ctrl-b w` choose-tree
work; a `?` fuzzy help palette replaces the cmdline's visible options; and ALL content becomes
pin-point accurate from the user's resume + data file (8 repos, real Enaimco/Memorial roles,
Education section, real resume.pdf, corrected contact). Dashboard rebrands to a Spidey-Hub
wordmark with a large seeded notification pool. Reboot resets everything. Goldens re-baselined
at 0-pixel tolerance at the end.

## Sources of truth

- User data file: `/Users/shev/Desktop/Portfolio-Website-Data.md` (personnel structure + bullets)
- Resume: `/Users/shev/Desktop/Shevinu_2026_Resume.pdf` (contact, education, Enaimco summary bullets)
- v2 content for Memorial roles: `/Users/shev/Development/personal-portfolio-v2/src/content/experience/`
- tmux fidelity reference: §"tmux fidelity reference" below (verified against tmux 3.7b source + live binary — do NOT re-research)

## Locked decisions (orchestrator-ruled; do not re-litigate)

1. **Session model**: default session is named `10.42.7.13` (matches boot mock `edith --session 10.42.7.13`),
   6 windows `0:dashboard … 5:help`, each initially one pane running its view program. Status bar left
   cluster stays `Session: 10.42.7.13 ·` but the value becomes dynamic per attached session
   (`Session: {name}`).
2. **`:q` semantics change**: site-mode `:q` (and the `q` cmdline command) now EXITS the active pane's
   program → the pane becomes a shell prompt in the same tmux window (lazygit analogy). It no longer
   kills the window. `Ctrl-b &` (kill-window) and `Ctrl-b x` (kill-pane) remain the kill paths.
   Ex-mode `:q` still closes the editor first (editor context wins), unchanged.
3. **`Ctrl-b d` is now detach** (real tmux), NOT "go home". `Ctrl-b w` is now choose-tree, NOT "go home".
   `Ctrl-b 0` still selects window 0. Existing tmux.spec tests for d/w→home are UPDATED, not preserved.
4. **`Ctrl-b x` kills the active tmux pane** (real semantics, confirm prompt `kill-pane {n}? (y/n)`,
   lowercase-y-only confirms, any other key cancels). The iteration-2 behavior of x killing
   Builds-internal panels is REMOVED (they are program UI, not tmux panes). x ALWAYS prompts
   kill-pane, even on a single-pane window — destroying the last pane destroys the window by
   cascade (real tmux; no kill-window-confirm fallback).
5. **Programs are per-pane component instances**: any pane shell can launch any program (`dashboard`,
   `builds`, `personnel`, `profile`, `retina-v`, `help`), even if it's already running elsewhere.
   Keyboard delegation targets the FOCUSED pane's program ref only.
6. **No persistence across reload**: session/pane/shell state is in-memory. Reload = factory state
   (boot skipped per existing sessionStorage flag). `reboot` (all triggers) = factory state + boot replay.
7. **Contact data** from resume: `shevinu2002@gmail.com`, `github.com/ShevinuM`,
   `linkedin.com/in/shevinum`, discord `shevinum` (kept). Phone number is NOT published on the site.
8. **Contributions-by-Stack table is OMITTED**: no Enaimco work repos exist on this machine and the
   GitHub token has no Enaimco org access — percentages cannot be computed accurately. Leave it out
   of role.md; user can add from the work machine later.
9. **Memorial mapping** (evidence-based): software-developer ← diag-lab.md; computer-science-tutor ←
   cs-tutor.md; research-assistant ← research-comms.md (displayed title "Research Assistant");
   design-and-development-assistant ← design-dev-assistant.md; communications-assistant ←
   sustainability-comms.md. No invented bullets — only rephrase/typo-fix the source bullets.
10. **Repos**: exactly these 8 submodules + the all-projects virtual repo: daily-tech-digest,
    transcript-tts, Legend-of-Arlo-Guardians-Gauntlet, SpotifyPal, Advent-of-Code-2024,
    Advent-Of-Code-2023, Sheldon, Data-Structures-And-Algorithms. SafePass is removed everywhere
    (.gitmodules, repos/, REPOS array, content doc, generated JSONs).
11. **Wordmark font**: "Webslinger" by Quinn Davis Type (public domain per designer's FontSpace
    listing), self-hosted as a subset woff2 in `public/fonts/`, applied ONLY to the dashboard
    "SPIDEY-HUB" wordmark. If download/conversion fails, fall back to hand-authored inline SVG
    lettering (never copy Marvel's actual logo artwork).
12. **Notifications**: ≥48 entries in `src/data/notifications.yaml`; on each arrival (hydration)
    pick 2 distinct via seeded PRNG (mulberry32). Seed = `Date.now()` in prod; overridable via
    sessionStorage key `edith:toast-seed` (set by test fixtures) for determinism. Dashboard-only,
    dismissible, like today's toasts.
13. **Cmdline**: suggestions list UI removed (input + error line only; Tab completion still works,
    silently). Cmdline AND the new help palette close on every window/session switch, program
    exit/launch, and detach (same window-chrome contract as grep).
14. **`?` opens the help palette** in every context EXCEPT: shell pane focused (types `?`), editor
    open (any mode), grep/cmdline/copy-mode/choose-tree open, status-bar prompt active, boot. The
    dashboard hotkey `?`→help-window is REPLACED by `h`→help-window (dashboard.yaml label `[h]`).
    `Ctrl-b ?` → help window stays.
15. **Blur**: when the dashboard window is active, the entire wallpaper/radar gets `filter: blur(3px)`
    (via the existing `wallFilter` knob in Wallpaper.svelte:84). Other views unchanged (0.72 opacity,
    no blur); retina-v stays sharp at 1.0.
16. **Out of scope this iteration** (stop conditions): Ctrl-b z zoom, Ctrl-b q display-panes,
    M-1..M-7 layout bindings (browser Alt conflicts), choose-tree search/filter/tag/sort keys,
    mouse pane resize/drag, `kill-session`/`kill-server` commands, session persistence, shell
    pipes/redirection/globbing, nested tmux beyond the faithful error message, phone number on site.
17. **Visual suite is EXPECTED RED between Phase 2 and Phase 7.** Per-phase verification runs
    unit + e2e + `pnpm check` + build only. Phase 7 re-baselines and must end with 3 consecutive
    clean visual runs at maxDiffPixels 0.
18. **Commits**: brief single-line subjects only, no body, NO Co-Authored-By trailer (user rule).

## tmux fidelity reference (verified; use these exact strings/behaviors)

- **Preset layouts (7)** and `next-layout` (prefix Space) cycle order:
  `even-horizontal → even-vertical → main-horizontal → main-horizontal-mirrored → main-vertical →
  main-vertical-mirrored → tiled → wrap`. Geometry: even-horizontal = columns L→R; even-vertical =
  rows top→bottom; main-horizontal = big main pane TOP, others as columns along the bottom;
  main-horizontal-mirrored = main BOTTOM; main-vertical = main LEFT, others stacked on the right;
  main-vertical-mirrored = main RIGHT; tiled = near-even grid. First Space on a manually-split
  window applies even-horizontal (lastLayout = -1 → index 0).
- **Splits**: `|` behaves like `split-window -h` → new pane to the RIGHT, focused; `-` like
  `split-window -v` → new pane BELOW, focused; 50/50 of the split pane. Also accept `%` and `"`
  as the stock aliases.
- **Pane nav**: prefix `o` = next pane (cycle), prefix arrow keys = directional, prefix `;` = last pane.
- **Kill prompts** (status-line, single-keystroke, lowercase `y` confirms, ANY other key cancels):
  `kill-pane {pane_index}? (y/n)` and `kill-window {window_name}? (y/n)`. Killing the last pane kills
  the window; killing the last window kills the session; if that session was attached the client
  detaches printing exactly `[exited]` in the host shell.
- **Detach** (prefix d): host shell prints exactly `[detached (from session {name})]`.
- **`tmux ls`** per session: `{name}: {N} windows (created {ctime})` + ` (attached)` when attached.
  Created time comes from the frozen page clock (deterministic under test).
- **`tmux a` / `tmux attach`** with no -t: most recently used unattached session; if none exist:
  `no sessions`. `tmux a -t x` missing → `can't find session: x`. `tmux new -s x` duplicate →
  `duplicate session: x`. Bare `tmux new` → next numeric name ("1", "2", …). Inside a pane shell,
  `tmux new`/`tmux a` refuse with `sessions should be nested with care, unset $TMUX to force`;
  `tmux ls` works everywhere.
- **choose-tree (prefix w)**: pane-content overlay (status bar stays visible). Top-level sessions,
  windows nested with `├─`/`└─` markers; session line `{name}: {N} windows[, (attached)]`; window
  line `{index}: {name}{flags}`. Current window initially selected; current session expanded, others
  collapsed. Preview strip at the bottom describing the selected item (program names per pane).
  Keys: j/k/Up/Down move; h/Left collapse (or jump to parent); l/Right expand; Enter = switch to
  selection (session or window) and close; x = kill selected window/session with in-overlay prompt
  `Kill window {i}? (y/n)` / `Kill session {name}? (y/n)` (case-INSENSITIVE y here — real tmux
  quirk); q/Esc cancel.
- **Window auto-rename**: window name = running program's command name (`dashboard`, `builds`, …);
  when the program exits to shell the name becomes `zsh`; launching a program renames again. A manual
  `Ctrl-b ,` rename disables auto-rename for that window. Status-line window format stays
  `{number}:{name}` + `*` active; ADD the real `-` flag on the previously-active window.

## Architecture notes for executors

- New pure module `src/lib/tmux.ts`: Session/Window/Pane tree model + operations (split, kill,
  focus next/directional/last, layout application for all 7 presets, next-layout cycle with
  lastLayout, auto-rename bookkeeping, session create/attach/detach/list, window flags incl. `-`).
  100% unit-testable, no DOM. Terminal.svelte owns one `$state` client object and calls into it.
- Rendering: replace the single `{#if view}` chain with a recursive pane renderer
  (`PaneTree.svelte`): split nodes render flex containers with 1px borders (active pane border
  accent like the mock); leaves render the program component (or Shell) via the existing component
  map, `bind:this` registered into a `Map<paneId, ref>` for delegation. Wallpaper, StatusBar,
  overlays stay mounted exactly as today.
- Views keep working at pane sizes (they're flex-based); no per-view layout rework — verify in
  e2e via bounding boxes only.
- `setView()` is replaced by `selectWindow(sessionId, windowIdx)` + `launchProgram(paneId, program)`
  + `exitProgram(paneId)`; ALL of them close grep + cmdline + help palette (window-chrome contract,
  close-before-early-return like today's `setView`). URL sync: pushState only when the active window
  of the DEFAULT session is a canonical program window; popstate maps route → session 0 window if
  present, else no-op.
- New `src/components/Shell.svelte` (one per shell pane) + pure `src/lib/shell.ts` (line parser,
  builtins, fs navigation against the generated index, deterministic output lines). Host shell
  (detached state) reuses the same Shell component fullscreen over the radar (dim wallpaper, no
  status bar — the mock in the user's screenshot: E.D.I.T.H shell header lines + prompt
  `shev@edith:~/shevinum.dev git:(main) $`).
- Shell builtins: `cd`, `ls`, `cat`, `pwd`, `tree`, `clear`, `whoami` (→ `shev`), `help`,
  `open <view>`, view names as bare commands (launch program in this pane), `neofetch` (ASCII
  spidey + E.D.I.T.H OS card), `sudo` (joke: `shev is not in the sudoers file. This incident will
  be reported to D.O.O.M.`), `exit` (pane shell: closes pane → cascades like kill-pane; host shell:
  prints `logout` then reloads the page), `reboot` (factory + boot replay), `tmux …`. In the HOST
  shell: `open <view>` ATTACHES session 0 and selects that view's window (the user's return_path
  is "only via a command" — open IS a return command); bare view-name commands print a hint to
  attach (`not attached — try: tmux a`); an `edith` builtin attaches session 0 at window 0 (the
  mock's header advertises `` `edith` to launch the site again ``). While detached, the `Ctrl-b`
  prefix is INERT — no prefix arming, no prefixed commands; keyboard belongs to the host shell.
  All strings data-driven from `src/data/shell.yaml` (content-purity rule).
- Shell fs: build-time `public/generated/fs-index.json` — repo-root tree (dirs + files + byte
  sizes), same skip list as the grep walker (node_modules/.git/dist/.astro/goldens/reference)
  PLUS `repos/*` subtrees taken from the per-repo index JSONs (paths only). `cat` resolves content
  lazily: site files from the grep index, `repos/<name>/…` files from that repo's index JSON;
  anything else prints `cat: {path}: binary or unindexed`. `tree` = ASCII tree with the same
  connectors as real tree(1), capped depth 3 with a `…` marker beyond.
- Delegation changes in Terminal.handleKey: focused-shell panes consume printable keys/Enter/
  Backspace/arrows (history up/down) BEFORE grep's `/` opener and BEFORE the bare-`:`/`?` openers;
  `:`/`?`/`/` type into the shell. Editor-open gate unchanged. `?` inserts in grep/cmdline inputs
  as today.

## Phases & steps

### Phase 1 — Real data: repos, personnel, profile, resume
- [x] 1.1 Remove SafePass everywhere; `git submodule add` the 6 missing repos (shallow); REPOS
  array → the 8 names; delete stale `src/content/projects/SafePass.md`; add content docs for the
  6 new repos (frontmatter matching existing shape; descriptions written ONLY from each repo's
  actual README; if a README is thin/absent, fall back to the repo's GitHub description — still
  no invention). Run `pnpm generate`; commit snapshots + indexes.
- [x] 1.2 RESOLVED BY DEVIATION (orchestrator-accepted): fixture stays fictional per the
  fixture-isolation design; drift guard green. Original step: Hand-update
  `fixtures/repos/all-projects.json` to the new project set; update the
  drift-guard unit test. **DEVIATION (executor, advisor-reviewed): NOT done as literally
  written.** `fixtures/repos/all-projects.json` mirrors `fixtures/projects/*.md` (fictional
  visual-test fixtures — flerken-watch/latveria-atlas/etc.), deliberately isolated from real
  project content per iteration 2's "Fixture isolation" design; there is no real-repo data to
  port into it, and the drift-guard test (`tests/unit/all-projects-fixture.test.ts`) is already
  content-agnostic (rebuilds its expectation from the fixture .md files at test time) — it needed
  no change and still passes. The likely intent — "the all-projects virtual repo reflects the new
  8-repo set" — is satisfied automatically by 1.1: `public/generated/repos/all-projects.json` is
  regenerated by `pnpm generate` from the real `src/content/projects/*.md` docs and committed.
  Left `fixtures/` untouched. Orchestrator: please confirm or redirect.
- [x] 1.3 Personnel restructure to the user's exact tree (lowercase dirs):
  `enaimco/software-developer/{role.md, full-time/role.md, part-time/role.md, co-op/role.md}` and
  `memorial-university/{software-developer,computer-science-tutor,research-assistant,design-and-development-assistant,communications-assistant}/role.md`.
  Content strictly from the data file + resume + v2 files (typos fixed: improve/infrastructure/
  introduced/architected/development/maintenance); Enaimco overview role.md = dates May 2024 –
  Present, St. John's NL, stack line, 4-6 concise XYZ summary bullets sourced from the resume's
  Enaimco section + data-file co-op bullets; NO contributions table. companies.yaml → enaimco,
  memorial-university. Personnel.svelte becomes depth-generic (tree derived from content paths;
  ../ and click-nav work at every level).
- [x] 1.4 Profile: correct CONTACT (per Locked #7); add EDUCATION section below Contact with both
  resume entries (degree, school, dates, location) — display titles EXACTLY "BSc. Computer
  Science" and "International Visiting Student" (user-shortened 2026-08-18 to avoid wrapping in
  the narrow panel; full titles stay only in the resume PDF); AND surface the data file's "Agent Profile →
  Summary" bio on the Profile page as its own SUMMARY/dossier block (user's words, near-verbatim —
  light trims for length are fine, no rewriting of voice; it is the authoritative bio). Data in
  profile.yaml; no strings in components.
- [x] 1.5 Replace `public/assets/resume.pdf` with `/Users/shev/Desktop/Shevinu_2026_Resume.pdf`.
- [x] 1.6 Update e2e (personnel.spec depth/labels, builds.spec repo list, profile.spec education +
  contact) and unit tests; regenerate grep index.

**Verify 1**: `pnpm generate` idempotent (second run = no diff); `node --test` green; e2e
personnel/builds/profile/grep specs green; `pnpm check` 0 errors; `pnpm build` succeeds;
`git submodule status` shows exactly 8; public/assets/resume.pdf ≈108KB; grep confirms no
"Toronto", no "SafePass", no fabricated dates remain in src/content; personnel dates match the
data file exactly (co-op May 2024 – Sep 2025; part-time Sep 2025 – Jul 2026; full-time Jul 2026 –
Present).

### Phase 2 — Dashboard branding: wordmark, welcome removal, blur, notifications
- [x] 2.1 Webslinger woff2 subset in `public/fonts/` + `@font-face`; dashboard plate title becomes
  the SPIDEY-HUB wordmark (arched/red styling evoking the reference, own rendering); remove
  `welcomePrefix` line + inline spidey glyph from the plate. dashboard.yaml drives all strings.
- [x] 2.2 Wallpaper: `wallFilter = blur(3px)` when the dashboard window is active (knob at
  Wallpaper.svelte:84); unchanged elsewhere.
- [x] 2.3 `src/data/notifications.yaml` with ≥48 entries across: tmux tips, vim tips,
  site-navigation tips, real facts about Shevinu (from the data file's Summary — travel/Mexico,
  hiking, reading, psychology, board-game competitiveness, systems-design goal), and
  Spider-Man/Doomsday/Secret Wars flavor written for a Spider-Man who has LOST HIS MEMORY and is
  in Battleworld (amnesia framing, no pre-Battleworld self-knowledge). Toasts.svelte: seeded
  2-distinct pick per Locked #12, dismissal behavior unchanged; dashboard-only.
- [x] 2.4 Unit tests: seeded picker (same seed → same pair, distinctness, full-pool reachability);
  e2e: fixtures set `edith:toast-seed`, assert the pinned pair renders + dismissal; nav.spec toast
  tests updated.

**Verify 2**: unit + e2e green; `pnpm check`; build; grep asserts zero hardcoded notification/title
strings in components; woff2 exists (small, subset) and referenced with `font-display: swap`;
`welcome back` appears nowhere in src/ EXCEPT src/data/boot.yaml (verbatim boot-mock copy from
iteration 2's exact-recreation mandate — orchestrator-ruled in scope to keep).

### Phase 3 — Cmdline scoping + bare UI + `?` help palette + `h` binding
- [x] 3.1 Remove the cmdline suggestions list rendering (keep input, error line, Tab completion);
  delete/adjust the suggestion tests in cmdline.spec; visual recipe 15-cmdline changes in Phase 7.
- [x] 3.2 Window-chrome the cmdline: add `close()` to the ref contract; close it in every switch
  path + reboot (integration points per codebase map: Terminal.svelte setView/reboot; close BEFORE
  the same-view early return). e2e: open cmdline → status-bar click switch → box closed; reboot →
  closed.
- [x] 3.3 New `HelpSearch.svelte` + pure `src/lib/helpSearch.ts`: `?` opens a cmdline-style palette
  titled from data; empty query lists the command entries (dashboard/builds/personnel/profile/
  retina-v/help/grep/reboot/resume, as in the user's screenshot); typing fuzzy-searches ALL entries
  (cmdline commands + every help.yaml key row + shell builtins once Phase 4 lands) with scoring
  exact > prefix > word-boundary > substring > subsequence (+ small Levenshtein tiebreak), top 10.
  Up/Down navigate, Enter executes executable entries (view jumps, grep, reboot, resume) and
  no-ops on keymap rows, Esc closes. Gating per Locked #14. Window-chrome close like 3.2.
- [x] 3.4 Rebind dashboard help hotkey `?`→`h` (views.ts HOTKEY_TO_VIEW + dashboard.yaml `[h]`
  label + help.yaml row); `?` on dashboard now opens the palette like everywhere else.
- [x] 3.5 Unit tests for helpSearch scoring/ranking; e2e help-search.spec (open from ≥3 contexts,
  gated contexts don't open, fuzzy canaries e.g. "kil" → kill-window/kill-pane rows, Enter
  executes, window-switch closes).

**Verify 3**: unit + e2e green incl. new spec; `pnpm check`; build; cmdline shows NO options list
(DOM assertion); `?` in builds/personnel/profile/retina-v/help opens palette; `h` on dashboard
opens Help window; cmdline/palette close on window switch (e2e).

### Phase 4 — Programs & the in-window shell (`:q` → shell, relaunch, auto-rename)
- [ ] 4.1 `src/lib/tmux.ts` model (single-pane windows this phase) + Terminal refactor: client
  $state {sessions, attachedSessionId}; windows own panes owning programs; PaneTree renderer;
  delegation via focused-pane ref map; URL sync per Architecture notes; popstate routed through
  selectWindow. All existing behavior (switching, rename, kill-window, prefix cycle, status bar
  click) preserved against the new model. **CHECKPOINT: after 4.1, run the FULL existing e2e
  suite and get it green before starting 4.2** — keeps the fix loop scoped to the refactor.
- [ ] 4.2 Shell.svelte + shell.ts + shell.yaml + `fs-index.json` generation in generate.mjs;
  builtins per Architecture notes (except tmux session subcommands — Phase 5); `dashboard` etc.
  launch programs in-pane; `exit` closes the pane→window cascade (last-window guard stays until
  Phase 5 adds sessions).
- [ ] 4.3 `:q`/`q` cmdline command → exitProgram(focused pane) per Locked #2; window auto-rename
  (program name ↔ `zsh`, manual rename wins); status bar shows renames live + `-` flag for last
  window.
- [ ] 4.4 Reboot reset now also rebuilds the client to factory (sessions/windows/panes/programs/
  shell buffers) and clears toast dismissals — single factory() in tmux.ts.
- [ ] 4.5 Tests: unit tmux.ts (model ops) + shell.ts (parser, cd/cat/tree against a fixture index);
  e2e shell.spec (`:q` from dashboard → prompt; typing `dashboard` relaunches; cat/cd/pwd/tree/
  neofetch/sudo/whoami/help outputs; window renamed dashboard→zsh→dashboard in status bar; reboot
  factory-resets); cmdline.spec `:q` updates; tmux.spec updates for auto-rename.

**Verify 4**: full unit + e2e green; `pnpm check`; build; fs-index.json generated & idempotent;
probes: `:q` on builds → shell; `cat package.json` prints real content; `cat
repos/Sheldon/README.md` prints from repo index; URL unchanged while in shell; reboot restores
6 factory windows.

### Phase 5 — Host shell, detach, sessions
- [ ] 5.1 Detach (`Ctrl-b d`, replaces go-home): host shell fullscreen over the radar (wallpaper
  dim per mock, NO status bar), pre-seeded scrollback from shell.yaml matching the user's mock
  (E.D.I.T.H header lines, earlier `tmux new -s 10.42.7.13` + edith launch narrative, prompt
  `shev@edith:~/shevinum.dev git:(main) $`), then appends `[detached (from session 10.42.7.13)]`.
  Host shell = same Shell component, host mode.
- [ ] 5.2 tmux subcommands per fidelity reference: `tmux ls`, `tmux new [-s name]`, `tmux a|attach
  [-t x]` incl. exact error strings, nested-refusal inside panes, most-recent-unattached pick,
  `no sessions`. New sessions start with one `zsh` window (window 0). Status bar + choose-tree
  (Phase 6) show the attached session's windows; `Session: {name}` left cluster.
- [ ] 5.3 Kill cascades: last pane → window → session; killing the attached session's last window
  detaches to host shell printing `[exited]`. `exit` in host shell prints `logout` + page reload.
- [ ] 5.4 Reboot factory() reachable from host shell via `reboot` builtin.
- [ ] 5.5 Tests: unit session ops (create/attach/detach/ls formatting with frozen clock,
  duplicate/missing errors); e2e sessions.spec (detach shows mock scrollback + detached line;
  `tmux ls` format; `tmux new -s test` + auto-attach; `tmux a -t 10.42.7.13` returns with window
  state intact; `[exited]` path; nested refusal; `logout` reload).

**Verify 5**: full unit + e2e green; `pnpm check`; build; probe: detach → host shell (radar dim,
no status bar) → `tmux ls` shows `10.42.7.13: 6 windows … (attached)`-style rows → `tmux a`
reattaches with prior window state intact.

### Phase 6 — Panes: splits, nav, kill, layouts, choose-tree
- [ ] 6.1 Split ops in tmux.ts (binary split tree; `|`/`%` right, `-`/`"` below, focused, 50/50) +
  PaneTree recursive flex rendering with borders + active-pane border accent; new panes run shell.
- [ ] 6.2 Pane nav: prefix o / arrows / `;`; focus follows; delegation targets focused pane.
- [ ] 6.3 `Ctrl-b x` real kill-pane per Locked #4 (+ cascade), Builds panel-kill removed (tests
  updated; Builds `canKillPane`/`killPane` exports deleted); `kill-pane` tmux command targets the
  focused pane.
- [ ] 6.4 Layout engine: all 7 presets per fidelity reference (pure tree→tree functions,
  unit-tested for pane counts 2/3/4/5); prefix Space cycles in the verified order with lastLayout;
  `select-layout <name>` added to the tmux command prompt vocabulary (+ usage/unknown errors).
- [ ] 6.5 choose-tree overlay (`Ctrl-b w`) per fidelity reference: tree of sessions/windows,
  markers, flags, initial selection, expand/collapse, Enter switch (window or session), x kill
  with case-insensitive confirm, q/Esc cancel, bottom preview strip (pane programs of selection).
  Window-chrome rules: opening closes grep/cmdline/palette; it owns the keyboard while open
  (delegation slot right after copy-mode).
- [ ] 6.6 Tests: unit layout engine + split/kill tree ops; e2e panes.spec (split, nav, kill
  confirm exact prompt text, cascades incl. `[exited]`, each of 7 layouts asserted via bounding
  boxes for 3 panes, Space cycle order, select-layout command) + choose-tree.spec (open, navigate,
  switch window + session, kill window via x, cancel, initial selection).

**Verify 6**: full unit + e2e green; `pnpm check`; build; probe: `|` then `-` → 3 panes, Space
seven times returns to even-horizontal; `Ctrl-b w` from a split window switches sessions.

### Phase 7 — Visual re-baseline + acceptance
- [ ] 7.1 Update recipes: existing 15 re-validated (01-dashboard now = wordmark + blur + seeded
  toasts; 15-cmdline without options); ADD: 16-shell (dashboard `:q` + `neofetch`), 17-host-shell
  (detached, mock scrollback), 18-split (3 panes, main-vertical), 19-choose-tree, 20-help-search
  (`?` + query `kil`). All recipes must produce meaningfully distinct PNGs (byte-compare guard
  from iteration 2 applies).
- [ ] 7.2 Re-baseline: `pnpm build:fixtures && playwright test tests/visual/identical.spec.ts
  --update-snapshots`, then 3 consecutive clean runs (40 goldens, maxDiffPixels 0). Toast seed +
  clock frozen via fixtures; fs/shell output deterministic by construction.
- [ ] 7.3 help.yaml + README keymap tables updated for every new binding/command (window `[h]`,
  `?` palette, splits, layouts, choose-tree, detach, sessions, shell builtins).
- [ ] 7.4 Full acceptance sweep (verifier): all ACs below with live probes.

## Acceptance criteria (final verifier checklist)

- AC1 `Ctrl-b w` opens a faithful choose-tree; Enter switches windows AND sessions; x kills with
  the in-overlay prompt; q/Esc cancels; current window initially selected.
- AC2 `Ctrl-b |` and `Ctrl-b -` split (right/below, focused, 50/50); `%`/`"` alias; prefix
  o/arrows/`;` navigate; `Ctrl-b x` prompts `kill-pane {n}? (y/n)`, y kills, other keys cancel;
  cascades window→session→`[exited]`.
- AC3 `Ctrl-b Space` cycles exactly: even-horizontal, even-vertical, main-horizontal,
  main-horizontal-mirrored, main-vertical, main-vertical-mirrored, tiled; geometries match the
  reference; `select-layout <name>` works from `Ctrl-b :`.
- AC4 `:q` in any program window drops to an in-window shell (session bar intact); typing
  `dashboard`/`builds`/… relaunches; window auto-renames program↔zsh in the status bar.
- AC5 Shell builtins all work with data-driven strings: cd/ls/cat/pwd/tree/clear/whoami/help/
  open/edith/neofetch/sudo/exit/reboot; host-mode `open <view>` and `edith` attach; prefix inert
  while detached; cat prints real file content from the generated indexes for
  BOTH site files and repos/ files; fs walk covers src/ public/ fixtures/ repos/ scripts/ tests/
  + root files.
- AC6 `Ctrl-b d` detaches to the host shell over the dim radar with the pre-seeded creation
  narrative + `[detached (from session 10.42.7.13)]`; `tmux ls` / `tmux new -s test` /
  `tmux a [-t …]` behave with the exact verified strings; `[exited]` on last-window kill; `exit`
  in host shell → `logout` + reload; nested tmux refusal inside panes.
- AC7 Reboot (status bar, `r`, `:reboot`, shell `reboot`) restores FULL factory state: 6 windows,
  no splits, no extra sessions, shell buffers cleared, toasts re-picked, then boot replays.
- AC8 Data accuracy: personnel tree matches the user's data file exactly (structure + dates:
  co-op May 2024–Sep 2025, part-time Sep 2025–Jul 2026, full-time Jul 2026–Present, overview
  May 2024–Present; Memorial 5 roles from v2 sources); NO fabricated content remains (grep:
  Toronto, "34m → 6m", "event bus" absent); contact = resume values, no phone; Education section
  present with both entries; Profile shows the data file's Summary bio as a dossier block;
  Builds shows the 8 repos + all-projects; real resume.pdf served.
- AC9 Dashboard: SPIDEY-HUB wordmark in the embedded font (no "shevinum.dev" title, no
  "welcome back"), whole radar blurred behind it; notifications = 2 seeded picks from ≥48-entry
  pool, dismissible; spot-check 5 seeds → ≥4 distinct pairs.
- AC10 Cmdline: no options list; closes on window switch/reboot/detach; `?` palette opens
  everywhere per gating, fuzzy-matches (canary queries), Enter executes commands; dashboard `h`
  opens Help window; `?` no longer bound to help window anywhere.
- AC11 All suites green: `pnpm check` 0 errors; `node --test` unit; full Playwright e2e; visual
  suite 3 consecutive clean runs at maxDiffPixels 0 across all recipes × 2 viewports; `pnpm
  generate` idempotent; content-purity greps (no UI strings in components beyond accepted
  residual page titles).

## Risks / notes
- Legend-of-Arlo & DSA submodules may be heavy — use shallow submodule clones; generated repo
  JSONs are lazy-fetched so runtime cost is bounded; cap per-file content like the grep walker.
- The Svelte 5 read-then-write $effect hazard (iteration 2) applies to the new client $state —
  use untrack() for fetch bookkeeping in Shell/PaneTree.
- Multi-instance programs (same view in 2 panes) must not double-register paste targets — the
  stack registry handles it, but editor-open gating must consult the FOCUSED pane only.
- popstate bypasses the switch pipeline today; route it through selectWindow in Phase 4.

# shevinum.dev v3

A terminal/tmux-styled personal portfolio, built as a static Astro 7 +
Svelte 5 + Tailwind 4 site. It started as a pixel-faithful recreation of a
design handoff (`design/Homepage.dc.html`) and has since grown into a
genuinely tmux/vim-faithful terminal: a real tmux prefix (`Ctrl-b`) with
window switching, rename/kill-window/kill-pane, copy-mode, and a
send-prefix binding; a lazygit-style Builds view over three real git
submodules with commit-time tree browsing via the GitHub API; a yazi-style
3-level Personnel Files browser; a vim-lite modal editor (NORMAL/VISUAL/
VISUAL-LINE, motions, counts, yank, in-buffer search); a `/`-triggered grep
overlay that searches the site's own source; a noice.nvim-style floating
`:` command box; an E.D.I.T.H boot sequence on first load; a live network
meter; and a dedicated `?` Help window listing every binding. Bare `q`/Esc
never change the active view anywhere — navigation is tmux prefix keys,
mouse clicks, or the dashboard menu; Esc is reserved for exiting modals
(grep, filters, prompts, copy-mode, visual mode, the cmdline box).

Every user-visible string lives in `src/content/**` or `src/data/*.yaml` —
none of it is hardcoded in a component. See "Architecture" below.

## Quickstart

```sh
pnpm install        # installs deps; does NOT init the git submodules — see below
git submodule update --init --recursive   # first time only (or after a fresh clone)
pnpm generate        # writes public/generated/**, src/generated/commits/**
pnpm dev              # http://localhost:4321, live-reloading
pnpm build            # static production build -> dist/
pnpm preview           # serves the last `pnpm build` output in the background
```

`pnpm generate` also runs automatically before `pnpm dev`/`pnpm build`
(`predev`/`prebuild` in `package.json`), so day to day you can usually just
run `pnpm dev` or `pnpm build` directly. Run it manually whenever you want
to regenerate the derived JSON without a full dev server or build (e.g.
after editing a submodule checkout, or after adding `README.md` content
that should show up in the grep index).

`pnpm preview` runs Astro's own preview server, which **daemonizes** (the
launching command exits almost immediately; the server keeps running in
the background on whatever port is free, printed to the console along with
its PID). Stop it with:

```sh
npx astro preview stop
```

(The test suites do **not** use `pnpm preview` for this exact reason — see
"Visual-test philosophy" below.)

### Commands reference

| command | what it does |
|---|---|
| `pnpm install` | installs dependencies (pnpm workspace, `packageManager` pinned) |
| `pnpm generate` | regenerates `public/generated/repos/*.json`, `public/generated/grep-index.json`, `src/generated/commits/*.json` |
| `pnpm dev` | `astro dev` at `http://localhost:4321` |
| `pnpm build` | production build (real content) to `dist/` |
| `pnpm build:fixtures` | fixture-mode build (`PORTFOLIO_FIXTURES=1`), used by the visual suite |
| `pnpm preview` | serves the last build via Astro's own (daemonizing) preview server |
| `pnpm check` | `astro check` + `tsc --noEmit` + `svelte-check --threshold error` |
| `pnpm test:unit` | `node --test tests/unit/*.test.ts` — docline, grep, repo tree, net, github commits/trees, views, vim engine, boot math, cmdline parser, all-projects fixture drift guard |
| `pnpm test:visual` | fixture build + 30 golden screenshot comparisons (`tests/visual/identical.spec.ts`, 15 recipes × 2 viewports) |
| `pnpm test:e2e` | real-content build + the full Playwright behavioral suite (`tests/e2e/*.spec.ts`) |
| `pnpm goldens` | **historical/guarded** — see "Regenerate goldens" below; refuses to run without an explicit `--restore-prototype-parity` flag |

`pnpm check`/`pnpm test:unit`/`pnpm test:e2e`/`pnpm test:visual`/`pnpm build`
were all run clean against this exact checkout as part of the Phase 6 full
acceptance pass (see PLAN.md's Acceptance criteria).

## Content workflows

Nothing in `src/components/**` should ever need editing to change what the
site *says* — only what it *does*. Content and copy live in
`src/content/**` (Builds project docs, Personnel role docs) and
`src/data/*.yaml` (everything else: profile fields, dashboard copy, status
bar strings, hints, grep chrome, mobile-block copy, etc.).

### Builds interaction model (PLAN.md Iteration 2 rework)

Panel [3] "Local Repositories" is a **flat list of every repo across every
project** (grouped by project `order`, `*` on each project's first `repos`
entry, `•` on the rest) plus a virtual **all-projects** entry appended last
(every `src/content/projects/*.md` file, browsable as its own tiny repo —
see "all-projects fixture" below). Clicking/`Enter`-ing a repo row loads its
working tree into panel [2] (now a tree browser, not a project list);
clicking/`Enter`-ing a file there previews it in panel [0], `Enter` on a
file opens the shared vim editor. Panel [4] Commits follows *only* panel
[3]'s repo selection (never panel [2]/[0] navigation); clicking/`Enter`-ing
a commit fetches that commit's tree into panel [2] (a lazygit-style
`Pulling ··●` spinner shows on the repo row while the fetch is in flight) —
`o` opens it on GitHub in a new tab, nothing else does. See `src/data/
help.yaml`'s "Builds" section (rendered in the app's own `?` Help window)
for the complete key-by-key reference.

### Add a Builds project

1. Add the upstream repo as a git submodule under `repos/`:
   ```sh
   git submodule add https://github.com/<owner>/<repo-name> repos/<repo-name>
   ```
2. Add a content file `src/content/projects/<repo-name>.md` with
   frontmatter matching the `projects` collection schema
   (`src/content.config.ts`):
   ```md
   ---
   title: <repo-name>
   order: <next integer, controls this project's group position in panel [3]'s flat repo list>
   repos:
     - name: <repo-name>
       github: <owner>/<repo-name>
       branch: main
   ---
   # <repo-name>

   One paragraph in the site's voice, plus `## Stack` / `## Status`
   sections (see the existing three files in that directory for the exact
   tone/shape).
   ```
   A project can list more than one `repos` entry (first one gets the `*`
   mark in panel [3], the rest get `•`) if a single Builds "project" ever
   needs to span multiple repos.
3. Regenerate the derived JSON (repo file-tree index, commit snapshot with
   full `sha` + `sha8`, the grep index, and the **all-projects** index — the
   new `.md` file and any new submodule source files all get indexed):
   ```sh
   pnpm generate
   ```
4. Commit the submodule addition (`.gitmodules` + the new `repos/<name>`
   gitlink), the new content file, and the regenerated
   `public/generated/repos/<name>.json`, `src/generated/commits/<name>.json`,
   `public/generated/repos/all-projects.json`, and
   `public/generated/grep-index.json`.

### Remove a Builds project

1. Delete `src/content/projects/<name>.md`.
2. Remove the submodule:
   ```sh
   git submodule deinit -f repos/<name>
   git rm -f repos/<name>
   rm -rf .git/modules/repos/<name>
   ```
   (This also removes its entry from `.gitmodules`.)
3. Delete the now-orphaned generated files:
   ```sh
   rm -f public/generated/repos/<name>.json src/generated/commits/<name>.json
   ```
4. `pnpm generate` to refresh the grep index + `all-projects.json`, then
   commit everything above.

### all-projects fixture (`fixtures/repos/all-projects.json`)

The virtual all-projects repo (see "Builds interaction model" above) is
built by `scripts/generate.mjs`'s `generateAllProjectsIndex()` from
`src/content/projects/*.md` for the real site
(`public/generated/repos/all-projects.json`, regenerated by `pnpm
generate`) — but the visual-regression/fixture build (`pnpm
build:fixtures`) must never couple its goldens to real project content, so
its equivalent, `fixtures/repos/all-projects.json`, is **hand-committed**
instead of generated, and `build:fixtures` copies it over the built
`dist/generated/repos/all-projects.json` as one of its last steps (same
idiom as the existing `fixtures/grep-index.json` copy). It must always
exactly match a fresh index built from `fixtures/projects/*.md` (same
`{name, files: [{path, lines}]}` shape, `path` = filename verbatim, `lines`
= raw file text split on `"\n"`, sorted by `path.localeCompare`) —
`tests/unit/all-projects-fixture.test.ts` enforces this by rebuilding that
index in memory and asserting deep-equality against the committed file, so
editing a `fixtures/projects/*.md` file (or adding/removing one) without
updating `fixtures/repos/all-projects.json` fails `pnpm test:unit`
immediately instead of silently desyncing the visual goldens.

**To regenerate it** after touching `fixtures/projects/*.md`, run this
one-off snippet (mirrors `generateAllProjectsIndex()` exactly) from the repo
root and commit the result:

```sh
node -e '
  const { readdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
  const { join } = require("node:path");
  const dir = "fixtures/projects";
  const files = readdirSync(dir)
    .filter((e) => e.endsWith(".md") && statSync(join(dir, e)).isFile())
    .map((e) => ({ path: e, lines: readFileSync(join(dir, e), "utf8").split("\n") }))
    .sort((a, b) => a.path.localeCompare(b.path));
  writeFileSync("fixtures/repos/all-projects.json", JSON.stringify({ name: "all-projects", files }) + "\n");
'
```

Then run `pnpm test:unit` to confirm the drift guard passes.

### Add a personnel role

Personnel is **3 levels deep**: company → employment type → role file
(e.g. `Enaimco/ → Full-Time/ → software-developer.md`), grouped by
frontmatter (`company` + `employmentType`), not by directory depth — though
in practice the on-disk layout mirrors that grouping 1:1.

1. Add `src/content/personnel/<Company>/<EmploymentType>/<role-slug>.md`
   with frontmatter matching the `personnel` collection schema (`company`,
   `role`, `months`, `dates`, `loc`, `order`, and the required
   `employmentType` — see any existing file under `src/content/personnel/`
   for the exact body shape: an `h1` + one-line meta, then `##
   Highlights` / `## Stack`).
   - `company` must exactly match an existing (or new) entry in
     `src/data/companies.yaml` (`name`, plus a display `order`) — that file
     controls the company list's order in the Personnel view, independent
     of role `order` within a company.
   - `employmentType` should match the role's containing directory name
     (e.g. `Full-Time`) — it drives the middle-level grouping in
     `Personnel.svelte`, independent of any directory structure the loader
     itself doesn't care about (Astro's `glob()` loader sees a flat entry
     list regardless of nesting).
   - A brand-new company just needs one more entry appended to
     `companies.yaml` and a `src/content/personnel/<Company>/` directory.
2. `pnpm generate` (keeps the grep index in sync with the new file) and
   commit both.

### Edit profile / site data

Every other user-visible string — profile fields and summary, the record
database stats, contact rows, dashboard plate/menu/footer copy, toasts,
tracker HUD text and map labels, the status bar's session string and
window names, keymap hints, grep chrome strings, and the mobile-block copy
— lives in `src/data/*.yaml`. Edit the relevant file directly; no
regeneration step is needed for these (they're read at build/dev time via
Vite `?raw` imports, not by `pnpm generate`), though `pnpm generate` is
harmless to re-run if you're unsure.

### Refresh commit snapshots

`src/generated/commits/<repo>.json` is a build-time snapshot of each
submodule's 15 most recent commits (via the GitHub REST API), imported
statically so Builds renders identically offline. Refresh it with:

```sh
pnpm generate
```

Set `GITHUB_TOKEN` in the environment first if you're hitting GitHub's
unauthenticated rate limit (60 req/hr per IP). If the API call fails for a
repo, the existing committed snapshot is left untouched and a warning is
printed — `pnpm generate` never deletes a snapshot it can't refresh.

The client also does its own live refresh once per session (first Builds
open, `sessionStorage`-cached for 10 minutes) with a silent fallback to the
snapshot on failure — the checked-in snapshot is what a fresh visitor's
*first* paint always shows.

### Regenerate goldens (self-baseline re-baseline procedure)

The visual-regression suite (`pnpm test:visual`) compares the real build
against 30 checked-in PNGs (`tests/visual/goldens/<viewport>/<state>.png`,
15 recipes × 2 viewports — `tests/visual/recipes.ts`). Through Phase 5 these
were captured from a vendored copy of the original design prototype
(`tests/visual/reference/`); as of the Phase 6 re-baseline they are
**self-baselines** — captured from, and compared against, this same
implementation — because the approved feature set has since deliberately
diverged from the prototype's own behavior in ways a byte-for-byte
prototype comparison can no longer express (tmux-faithful navigation, the
Builds rework, 3-level Personnel, the vim engine, the boot sequence, the
cmdline box — several of the 15 recipes reach states the prototype has no
code path for at all). See `tests/visual/README-PIPELINE.md` for the full
history/rationale.

**The canonical re-baseline path**, whenever a deliberate UI/behavior
change legitimately changes what a golden should show:

```sh
pnpm build:fixtures && playwright test tests/visual/identical.spec.ts --update-snapshots
```

Then run the project's **determinism gate** — `pnpm test:visual` **three
consecutive times** — and confirm all three pass clean (0 failures). This
is not optional ceremony: a golden that only fails intermittently after
`--update-snapshots` baked in something non-deterministic (a live
measurement, an un-flushed timer, GPU rasterization jitter), and the fix is
to root-cause that nondeterminism (a mask, a wait, a clock-control fix,
etc.), not to re-run `--update-snapshots` until it happens to pass once.
Finally, inspect every new/changed `.png` yourself (not just the byte diff)
for obvious rendering defects — blank panels, clipped text, missing
overlays — before committing.

`tests/visual/capture-goldens.mjs` (`pnpm goldens`) is kept only as a
**historical record** of how the very first (Phase 1) baseline was
produced against the vendored prototype — it refuses to run without an
explicit `--restore-prototype-parity` override flag precisely so nobody
fat-fingers it expecting a self-baseline refresh and silently overwrites
the 30 self-baselines with 20 screenshots of the frozen prototype (see that
script's own header comment). Use the `--update-snapshots` path above for
all normal re-baselining.

**Playwright-upgrade rule**: `@playwright/test` is pinned exactly (no `^`)
in `package.json` — the goldens are only valid for the exact Chromium build
that captured them. If you ever bump the Playwright version, you **must**
re-baseline (the procedure above) in the same change and re-verify the
three-run determinism gate before committing. Do not bump Playwright and
leave the old goldens in place.

### Update submodules

To pull in newer upstream commits for one of the three tracked repos:

```sh
git submodule update --remote repos/<name>
pnpm generate   # refreshes that repo's file-tree index, commit snapshot, and the grep index
git add repos/<name> public/generated/repos/<name>.json src/generated/commits/<name>.json public/generated/grep-index.json
```

Or to update all three at once: `git submodule update --remote` (no path
argument), then `pnpm generate` and commit as above.

## Keymap reference

**Single source of truth**: `src/data/help.yaml` — every row below is
transcribed from it, and the app's own `?` Help window (`Ctrl-b ?`,
`Ctrl-b 5`, a status-bar click on "5:help", or the dashboard menu's Help
row) renders that same file, so this table and the in-app reference cannot
drift silently (both are reviewed together whenever a binding changes).
**Bare `q`/Esc never switch the active view anywhere** — Esc only exits
whatever's currently open (grep, a filter, a status-line prompt, copy-mode,
visual mode, the cmdline box), never a view.

### Global

| key | action |
|---|---|
| `b` / `p` | Builds (from the dashboard) |
| `x` | Personnel Files (from the dashboard) |
| `i` | Profile (from the dashboard) |
| `t` | E.D.I.T.H: Retina-V (from the dashboard) |
| `?` | Help (from the dashboard) |
| `r` | reboot (from the dashboard only — replays the E.D.I.T.H boot sequence); Profile has its own `r` for downloading the resume, unrelated |
| `/` | open the grep overlay (from any view — inside the vim file editor, `/` searches the open buffer instead) |
| `:` | open the floating Cmdline box (from any view, and inside an open file editor as its ex-command line) — a literal `:` still types normally inside the grep query, the Personnel filter, and the rename prompt |
| `j` / `k` / arrows | move selection within the active pane |
| `Enter` | open / drill in |
| `Esc` | exits whatever's open — grep, a filter, a status-line prompt, copy-mode, the tmux prefix — never a view switch |
| held ⌘/Ctrl/Alt + key | falls through untouched (browser/OS shortcuts still work) |

### Window switching (mouse)

| action | targets |
|---|---|
| click a status-bar window | jump straight to it — `0:dashboard 1:builds 2:personnel 3:retina-v 4:profile 5:help` |
| click a dashboard menu row | same targets as their hotkeys |

### tmux prefix (`Ctrl-b`)

Press `Ctrl-b`, then within **2 seconds** press one more key:

| prefixed key | action |
|---|---|
| `1` / `2` / `3` / `4` / `5` | jump straight to Builds / Personnel / Retina-V / Profile / Help |
| `n` | next window (dashboard → builds → personnel → retina-v → profile → help → dashboard …) |
| `p` | previous window (reverse cycle) |
| `d` / `w` / `0` | dashboard |
| `?` | Help (tmux `list-keys` style) |
| `Esc` | cancel the prefix (no action) |
| `,` | **rename-window**: status bar swaps to an editable prompt prefilled with the current name; `Enter` commits, `Esc` cancels — while open it owns the keyboard, exactly like grep |
| `&` | **kill-window**: status bar prompts `kill-window <name>? (y/n)`; `y` removes the window from the list and switches to the next remaining one if it was active (refuses, with a status message, to kill the last remaining window) |
| `x` | **kill-pane**: inside Builds with more than one panel visible, confirms then removes the FOCUSED panel only (the rest keep their positions; the layout resets the next time Builds is opened); everywhere else — including Builds reduced to one panel — the only pane IS the window, so it's the exact same kill-window confirm as `&` |
| `Ctrl-b` (send-prefix) | tmux's own default binding: a second `Ctrl-b` while the prefix is armed disarms it and dispatches a LITERAL `Ctrl-b` down to the view underneath — this is how vim's own `Ctrl-b` (full-page-back) is reachable at all, since a bare `Ctrl-b` is otherwise always consumed by the prefix arm |
| `[` | **copy-mode**: opens a generic overlay over the active pane's text (editor buffer, the focused Builds panel, the Personnel row list, the Profile summary, the tracker HUD, the Help content, or the dashboard menu) — vim-navigate it, `v` to start a selection, `y`/`Enter` to yank and exit, `q`/`Esc` to exit without yanking |
| `]` | **paste-buffer**: inserts the last copy-mode/vim yank into the active text input (grep query, Personnel filter, the rename prompt, or the editor's in-buffer search) — a status-line message appears if nothing's active or nothing's been yanked yet |
| `:` | opens the floating Cmdline box in tmux command-prompt mode — see "Cmdline" below |
| anything else | silently swallowed (mirrors real tmux's "unbound prefixed key does nothing") |
| (while the grep overlay is open) | the prefix still works — it consumes the next key before grep ever sees it (this is the reverse of the old rule: the prefix now has PRECEDENCE over grep, so e.g. `Ctrl-b ]` can paste into the grep query) |

Only `Ctrl-b` itself is intercepted to arm the prefix — every other
modifier-held key, even mid-prefix, still falls through untouched. The
prefix is inert on a mobile-blocked viewport (no keydown listener is ever
attached there at all) and while boot is playing.

### Vim keys (file editor)

The shared vim-lite engine (`src/lib/vim.ts` + `Editor.svelte`) backs both
Builds' and Personnel's file viewers identically — NORMAL / VISUAL /
VISUAL-LINE modes with a block cursor and a real `{line}:{col}` in the
footer.

| key | action |
|---|---|
| `j` / `k` | move the line cursor down/up (also works in Builds/Personnel lists) |
| `h` | up one level (Builds repo tree, Personnel employment-types/role-files levels) |
| `gg` | jump to the first entry / top of file (double-tap within ~500ms; a single `g` does nothing) |
| `G` | jump to the last entry / bottom of file |
| `Ctrl-d` / `Ctrl-u` | half-page scroll |
| `Ctrl-f` / `Ctrl-b` | full-page scroll — `Ctrl-b` is normally consumed by the tmux prefix arm first, but `Ctrl-b Ctrl-b` (send-prefix, above) dispatches a literal `Ctrl-b` through to here, so both directions are reachable from a real keypress |
| `h l w b e 0 ^ $` | column motions — NORMAL mode, with numeric counts (`5j`, `3w`) |
| `v` / `V` | VISUAL / VISUAL-LINE selection; motions extend it, `Esc` cancels back to NORMAL |
| `y` / `yy` | yank the selection / current line (`3yy` for 3 lines) to the paste buffer and system clipboard |
| `/` (in-buffer), `n` / `N` | search the open file and step through matches, with wraparound |
| `:` `:q` `:q!` `:w` `:wq` `:<number>` | ex-command line (floating Cmdline box, see below) — `:q`/`:q!` close the editor (the ONLY way to close it; bare `q`/Esc no longer do), `:w`/`:wq` show a readonly error, `:<number>` jumps to that line, anything else shows an E492-style error; `Esc` cancels |
| click the `[:q]` pill | same as `:q` — mouse parity for closing the editor |
| `i a o I A O c d x p s r ~` (etc.) | every mutating key flashes a readonly-buffer message and changes nothing — this viewer never writes |

### Copy mode (`Ctrl-b [`)

| key | action |
|---|---|
| `h` / `l` / `j` / `k` / arrows | move the copy-mode cursor over the captured pane text |
| `gg` / `G` | jump to the first / last line |
| `Ctrl-d` / `Ctrl-u` | page down / up |
| `v` | start (or cancel) a charwise selection |
| `y` / `Enter` | yank the selection (or, with no selection, the cursor's current line) to the paste buffer + system clipboard, then exit — `Ctrl-b ]` pastes it elsewhere |
| `q` / `Esc` | exit copy-mode without yanking — bare `q` is intentionally allowed here (and ONLY here): it never switches a view, it just closes this overlay |

### Grep overlay

| key | action |
|---|---|
| `/` | open (from anywhere); a bare `/` while typing is otherwise just a printable character |
| printable characters | append to the live query |
| `Backspace` | delete the last query character |
| `Ctrl-u` / `Ctrl-w` | clear the query |
| `↓` / `Ctrl-n` (or `Ctrl-j`) | next hit |
| `↑` / `Ctrl-p` (or `Ctrl-k`) | previous hit |
| `gg` / `G` | jump to the first / last hit |
| `Enter` | open the selected hit — routes to the owning view if the path maps to one, otherwise just closes |
| `Esc` / `Ctrl-c` | close, no navigation |

The grep overlay is **window chrome**, not session chrome: it belongs to
the window it was opened in, so switching windows while it's open (a
status-bar click or a `Ctrl-b` switch) closes it. The status bar itself is
never dimmed/blurred by grep's backdrop and stays clickable while grep is
open.

### Personnel filter (`f`) and navigation (mouse)

| key | action |
|---|---|
| `f` | enter filter mode on the `>` prompt |
| click the `>` prompt | also enters filter mode |
| any printable character | appended to the filter query; the entry list live-filters (case-insensitive substring on names) |
| `Backspace` | edit the filter query |
| `Esc` | clear the filter and exit filter mode |
| `Enter` | confirm the filter (exits typing; the filtered list stays applied) and returns to normal `j`/`k` navigation |
| click a row | activates it immediately — a company, an employment type, or a role file (single-click at every level, no select-then-activate) |
| click `../` | up one level (role files → employment types → companies) — or the dashboard, at the companies root |

### Builds

| key | action |
|---|---|
| `1` / `2` / `3` / `4` / `0` | focus panel Status / Files (tree browser) / Local Repositories (every repo, flat, plus all-projects) / Commits / Changes (preview) |
| `j` / `k` | move selection within the focused panel |
| `Enter` (panel [3], a repo) / click a repo row | load that repo's tree into panel [2] |
| click a file (panel [2]) | preview it in panel [0] — does not open the editor |
| `Enter` (a file in the tree) | open the file in the full-screen vim editor |
| click / `Enter` on a directory or `../` (panel [2]) | descend / go up one directory |
| `h` / `Backspace` (repo tree) | up one directory |
| click a commit / `Enter` on a commit (panel [4]) | load that commit's tree into panel [2] (a lazygit-style `Pulling ··●` spinner shows on the repo row) — no new tab |
| `o` (panel [4], commits) | opens the selected commit on GitHub in a new tab — the only remaining external-link path in Builds |
| `t` | E.D.I.T.H: Retina-V (works from Builds too, not only the dashboard) |
| `gg` / `G` | jump to the first / last row of the open tree in panel [2] (also inside the file editor) |

Panel [4] Commits tracks **only** panel [3]'s repo selection — it never
changes while navigating panel [2]/[0]. The virtual **all-projects** repo
(last row in panel [3]) has no commits (a "local only" line instead) and
lists every `src/content/projects/*.md` file as its own browsable tree.

### Boot sequence / reboot

A fresh browser tab plays the E.D.I.T.H boot sequence (`src/components/
BootSequence.svelte`, copy/config in `src/data/boot.yaml`) once before the
dashboard appears — unskippable while it runs (no key or click bypasses
it; all global key handling is inert during boot). It plays at most once
per tab: a reload or a deep link later in the same tab (sessionStorage
flag) goes straight to the requested view.

| key / control | action |
|---|---|
| (fresh tab) | the boot sequence plays once automatically |
| `r` (on the ready dashboard only) | replays the boot sequence |
| click `↻ reboot` (status-bar right cluster, any view) | switches to the dashboard and replays the boot sequence |

### Cmdline (`:`)

One floating `─ Cmdline ─` box (`src/components/Cmdline.svelte`, same
visual family as the grep overlay), reachable three ways, with a live
suggestion list (name + description, prefix-filtered as you type; `Tab`
completes the unique/first match; arrows navigate suggestions — `j`/`k`
stay typeable as ordinary command text):

| entry point | mode |
|---|---|
| `:` with a Builds/Personnel file editor open | **ex mode** — Phase 3's own `:q`/`:q!`/`:w`/`:wq`/`:<number>` state machine tried first (editor context always wins, e.g. `:q` closes the editor, never the window), falling through to the site-wide command set below on anything it doesn't recognize |
| `:` anywhere else (no other text input active) | **site mode** — the site-wide command set below only; a literal `:` still types normally inside the grep query, Personnel filter, and rename prompt |
| `Ctrl-b :` | **tmux command-prompt mode** — `rename-window <name>`, `kill-window`, `kill-pane`, `select-window <0-5>`, executed through the exact same rename/kill/select-window code the `,`/`&`/`x`/digit bindings already use, without their interactive confirm step (a typed command is already deliberate) |

Site-wide command set (`src/data/cmdline.yaml`): `:dashboard` / `:home`,
`:builds`, `:personnel`, `:profile`, `:retina-v`, `:help` (window jumps);
`:grep <query>` (opens grep pre-filled and already searching); `:reboot`
(replays the boot sequence); `:resume` / `:cv` (same as Profile's `r`);
`:q` (kills the current window, same last-window refusal as `Ctrl-b &`).
`Esc` closes the box with no side effects; an unrecognized command shows
vim's own `E492: Not an editor command: <cmd>` error inside the box.

## Architecture

- **Routes**: six static pages,
  `src/pages/{index,builds,personnel,profile,retina-v,help}.astro`. Each
  one SSRs `src/layouts/Shell.astro` wrapping a single
  `src/components/Terminal.svelte` island with an `initialView` prop
  matching its own route, so the first paint matches the URL with no
  client-side flash. Every subsequent view switch is client-side only
  (`history.pushState`, with `popstate` handled) — there's no full page
  reload once hydrated. `ViewId` (`src/lib/views.ts`) is
  `home | builds | personnel | retina-v | profile | help`; the status bar's
  six windows are `0:dashboard 1:builds 2:personnel 3:retina-v 4:profile
  5:help` (`home` maps to the `dashboard` window).
- **Islands**: `Terminal.svelte` owns the view state machine, the tmux
  prefix state machine (arm/timeout/dispatch, rename/kill-window/kill-pane
  prompts, copy-mode, the paste buffer), the global keydown listener, and
  the mobile guard (`window.matchMedia('(min-width: 900px) and
  (pointer: fine)')`). Its keydown delegation order (`handleKey()`'s own
  header comments spell out the reasoning for each step): `BootSequence`
  (owns everything while booting) → copy-mode → the tmux prefix arm/dispatch
  → the floating `Cmdline` box / a status-bar rename-or-kill prompt (whichever
  is open) → the active view's own open file editor, if any (so `/` searches
  the buffer, vim-faithful) → `GrepOverlay` → the active view itself → the
  design keymap. It renders `Wallpaper`, `StatusBar`, `Dashboard` / `Builds`
  / `Personnel` / `Profile` / `TrackerView` / `HelpView` (one per view) plus
  the always-mounted `GrepOverlay`/`CopyMode`/`BootSequence`/`Cmdline`
  overlays. `Builds`/`Personnel` each delegate their own file-viewer state
  to a shared `Editor.svelte` (the vim-lite engine, `src/lib/vim.ts`) via a
  `bind:this` + `handleKey(): boolean` contract.
- **Data flow**: `src/lib/data.ts` loads every `src/data/*.yaml` file
  (Vite `?raw` imports, parsed with the `yaml` package) into typed getters
  (`getSite()`, `getDashboard()`, `getProfile()`, `getHelp()`, `getBoot()`,
  `getCmdline()`, etc.) that route pages call in their frontmatter and pass
  down as plain props — Svelte components never read the filesystem
  themselves. Content collections (`projects`, `personnel`) are defined in
  `src/content.config.ts` and fetched via `astro:content`'s
  `getCollection()`, also in each route page's frontmatter.
- **Generated artifacts** (`scripts/generate.mjs`, wired to
  `predev`/`prebuild`, or run directly via `pnpm generate`):
  - `public/generated/repos/<name>.json` — file tree + text contents for
    each of the three submodules under `repos/`, lazy-fetched by Builds
    when a repo is opened in panel [3].
  - `public/generated/repos/all-projects.json` — the same shape, built
    from `src/content/projects/*.md` instead of a submodule checkout;
    backs the virtual all-projects repo (see "Builds interaction model"
    above). Its fixture-mode equivalent is hand-committed, not generated
    — see "all-projects fixture" above.
  - `public/generated/grep-index.json` — a walk of the site's own source
    (`src/**`, `scripts/**`, `tests/**` except `goldens/`/`reference/`,
    plus a handful of root config files and this README), consumed by
    `GrepOverlay.svelte`.
  - `src/generated/commits/<repo>.json` — the build-time commit snapshot
    (full `sha` + `sha8`, message, GitHub `html_url`, author initials),
    imported statically (not fetched); `src/lib/githubCommits.ts` does a
    client-side live refresh on top of it (see "Refresh commit snapshots"
    above), and `src/lib/githubTrees.ts` separately fetches a commit's
    file tree + contents on demand (panel [2]'s commit-time browsing).
- **Fixture mode** (`PORTFOLIO_FIXTURES=1`, set by `pnpm build:fixtures`):
  the `projects` content collection switches to `fixtures/projects/*.md`
  (4 sample projects extracted verbatim from the design handoff, with
  matching `fixtures/commits/*.json`, `fixtures/repos/all-projects.json`,
  and `fixtures/grep-index.json`) so the visual-regression suite can do
  byte-for-byte pixel comparisons against its own self-baselined goldens
  without coupling them to real project content. The `personnel`
  collection, profile, dashboard, and tracker content are never
  fixture-switched. The grep-index and all-projects-index file swaps both
  happen post-build (`pnpm build:fixtures`'s last two steps copy
  `fixtures/grep-index.json` and `fixtures/repos/all-projects.json` over
  their built `dist/generated/` counterparts) so the exact same JS bundle
  runs in both goldens and production; only the JSON payloads differ.

## resume.pdf

`public/assets/resume.pdf` is a placeholder — a valid, clearly-marked
single-page PDF, not a real résumé. Swap it by replacing that file with a
real PDF at the same path (no code change needed; the `r` hotkey and the
Profile view's CV link both just point at `/assets/resume.pdf`).

## Deploy

This is a fully static site (`astro build` with `output: "static"`) — the
entire `dist/` directory produced by `pnpm build` can be served by any
static file host (there's no server-side runtime to provision). **No CI is
configured in this repository** — deployment is a manual `pnpm build` +
upload/sync of `dist/` to whatever static host you choose. If you do wire
up CI later, remember it needs to `git submodule update --init --recursive`
before `pnpm install`/`pnpm build`, since the three Builds repos are real
git submodules, not vendored copies.

## Visual-test philosophy

The visual-regression suite doesn't compare the real implementation
against hand-picked "looks right" screenshots — through Phase 5 it compared
against goldens captured from the **actual prototype**
(`design/Homepage.dc.html`, vendored into `tests/visual/reference/` with
its fonts patched to the same self-hosted files the real site uses). As of
the Phase 6 re-baseline, the 30 committed goldens
(`tests/visual/goldens/<viewport>/<state>.png`, 15 recipes × 2 viewports)
are **self-baselines** instead — captured from, and compared against, this
same implementation, because the final approved feature set has since
deliberately diverged from the prototype's own behavior (tmux-faithful
navigation, the Builds rework, 3-level Personnel, the vim engine, advanced
tmux bindings, a boot sequence, and a floating cmdline box — several
recipes reach states the prototype has no code path for at all). See
"Regenerate goldens" above for the re-baseline procedure and
`tests/visual/README-PIPELINE.md` for the full history/rationale.

Both the (historical, now-guarded) prototype comparison and the current
self-baseline comparison replay the same recorded key/type recipes
(`tests/visual/recipes.ts`) through the identical capture pipeline
(`tests/visual/pipeline.mjs`'s `captureState()`: fake clock installed
before navigation, a fixed `runFor` advance before *and* after the
recipe's actions, wait for fonts + network idle, screenshot with
animations disabled) — this is what makes the two eras of goldens
comparable at all. The two boot-sequence recipes (`13-boot-mid`,
`14-boot-ready`) are captured by a separate function, `captureBootState()`,
using `page.clock.pauseAt()` instead of `runFor()` — a still-running,
elapsed-time-driven overlay needs the clock genuinely frozen between
assertions, not just advanced, to be deterministic (see that function's
header comment in `pipeline.mjs` for the two empirically-discriminated
clock-API hazards this required working around, and the "live clock" note
below for a second place the same fix applied). Fixture-mode content (see
above) is what makes a pixel-for-pixel comparison possible for the
non-boot recipes at all, since the real Builds content differs from the
prototype's/fixtures' own fabricated sample projects.

A small number of elements are masked rather than compared directly — the
live network meter's bar strip and readout text are driven by real
Resource Timing measurements a faked `Date` doesn't freeze, so their exact
pixels are non-deterministic by design; the mask targets a CSS-fixed
ancestor row rather than either element's own (measurement-dependent)
bounding box, so the masked region itself stays deterministic run to run.
The comparison threshold starts at `maxDiffPixels: 0`; a documented,
narrowly-scoped `maxDiffPixelRatio: 0.0005` relaxation is allowed only for
ordinary GPU/compositor antialiasing jitter (verified case-by-case by
inspecting the actual diff image, not applied blanket) — the Phase 6
re-baseline found no such jitter across three consecutive full runs, so no
recipe currently carries that relaxation (`identical.spec.ts`'s
`RATIO_RELAXED` set is empty; any future addition needs fresh three-run
forensics, not a preemptive guess). See `tests/visual/README-PIPELINE.md`
for the full capture-order rationale and the recorded determinism checks
from both the original Phase 1 baseline and the Phase 6 re-baseline.

**Live clock note**: `tests/e2e/nav.spec.ts`'s live-clock test uses the
same `pauseAt()`-based technique as the boot goldens, for the same reason
— `page.clock.install()` does not itself freeze `Date.now()` (real time
leaks in until the first control call, including during page navigation),
and `runFor()` resumes real-time ticking again once it returns. A test
that reads an intermediate (not fully-settled) clock value after a
`runFor()` call is exposed to that resumed real-time ticking for as long as
it takes to run its next assertion — usually negligible, but occasionally
enough under heavy parallel-worker load to roll the displayed minute past
its expected value. `pauseAt(<absolute time>)` leaves the clock genuinely
frozen at its target instant regardless of how much real time subsequently
passes before the next read.

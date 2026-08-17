# shevinum.dev v3

A terminal/tmux-styled personal portfolio, built as a static Astro 7 +
Svelte 5 + Tailwind 4 site. It's a pixel-faithful recreation of a design
handoff (`design/Homepage.dc.html`), driven entirely by the keyboard: a
tmux-style status bar and window prefix, a lazygit-style Builds view over
three real git submodules, a yazi-style Personnel Files browser, a live
network meter, and a `/`-triggered grep overlay that searches the site's
own source.

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
| `pnpm test:unit` | `node --test tests/unit/*.test.ts` — docline, grep, repo tree, net, github commits, views |
| `pnpm test:visual` | fixture build + 20 golden screenshot comparisons (`tests/visual/identical.spec.ts`) |
| `pnpm test:e2e` | real-content build + the full Playwright behavioral suite (`tests/e2e/*.spec.ts`) |
| `pnpm goldens` | regenerates the 20 reference goldens from the vendored prototype in `tests/visual/reference/` |

Every command above was run against this exact checkout while writing this
file (including `pnpm dev`, confirmed serving `HTTP 200` at
`http://localhost:4321`, and `pnpm preview`, confirmed daemonizing and
serving the built `dist/`).

## Content workflows

Nothing in `src/components/**` should ever need editing to change what the
site *says* — only what it *does*. Content and copy live in
`src/content/**` (Builds project docs, Personnel role docs) and
`src/data/*.yaml` (everything else: profile fields, dashboard copy, status
bar strings, hints, grep chrome, mobile-block copy, etc.).

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
   order: <next integer, controls panel [2] order>
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
3. Regenerate the derived JSON (repo file-tree index, commit snapshot, and
   the grep index — the new `.md` file and any new submodule source files
   all get indexed):
   ```sh
   pnpm generate
   ```
4. Commit the submodule addition (`.gitmodules` + the new `repos/<name>`
   gitlink), the new content file, and the regenerated
   `public/generated/repos/<name>.json`, `src/generated/commits/<name>.json`,
   and `public/generated/grep-index.json`.

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
4. `pnpm generate` to refresh the grep index, then commit everything above.

### Add a personnel role

1. Add `src/content/personnel/<Company>/<role-slug>.md` with frontmatter
   matching the `personnel` collection schema (`company`, `role`, `months`,
   `dates`, `loc`, `order` — see any existing file under
   `src/content/personnel/` for the exact body shape: an `h1` + one-line
   meta, then `## Highlights` / `## Stack`).
   - `company` must exactly match an existing (or new) entry in
     `src/data/companies.yaml` (`name`, plus a display `order`) — that file
     controls the company list's order in the Personnel view, independent
     of role `order` within a company.
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

### Regenerate goldens

The visual-regression suite (`pnpm test:visual`) compares the real build
against 20 checked-in PNGs (`tests/visual/goldens/<viewport>/<state>.png`)
captured from the vendored prototype (`tests/visual/reference/`, a copy of
the original design handoff with its Google Fonts `<link>` patched to load
the exact same self-hosted Fontsource files the site uses). Regenerate them
with:

```sh
pnpm goldens
```

**Playwright-upgrade rule**: `@playwright/test` is pinned exactly (no `^`)
in `package.json` — the goldens are only valid for the exact Chromium build
that captured them. If you ever bump the Playwright version, you **must**
run `pnpm goldens` again in the same change and re-verify `pnpm
test:visual` passes at `maxDiffPixels: 0` (or the pre-authorized
`maxDiffPixelRatio: 0.0005` antialiasing tolerance — see
`tests/visual/identical.spec.ts`) before committing. Do not bump Playwright
and leave the old goldens in place.

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

### Global (design keymap)

| key | action |
|---|---|
| `b` / `p` | Builds (from the dashboard) |
| `x` | Personnel Files (from the dashboard) |
| `i` | Profile (from the dashboard) |
| `t` | E.D.I.T.H: Retina-V (from the dashboard, or from Builds) |
| `/` | open the grep overlay (from any view, including inside an editor) |
| `j` / `k` / arrows | move selection within the active pane |
| `Enter` | open / drill in |
| `q` or `Esc` | back to the dashboard (closes the grep overlay first, if open; from an open file editor, closes back to the file browser/builds view instead) |
| held ⌘/Ctrl/Alt + key | falls through untouched (browser/OS shortcuts still work) |

### tmux prefix (`Ctrl-b`)

Press `Ctrl-b`, then within **2 seconds** press one more key:

| prefixed key | action |
|---|---|
| `1` / `2` / `3` / `4` | jump straight to Builds / Personnel / Retina-V / Profile |
| `n` | next window (Builds → Personnel → Retina-V → Profile → Builds …) |
| `p` | previous window (reverse cycle) |
| `d` / `w` / `0` | dashboard |
| `Esc` | cancel the prefix (no action) |
| anything else | silently swallowed (no action — mirrors real tmux's "unbound prefixed key does nothing") |

Only `Ctrl-b` itself is intercepted to arm the prefix — every other
modifier-held key, even mid-prefix, still falls through untouched. The
prefix has no effect while the grep overlay is open (grep owns every key
while it's up, including `Ctrl-b`) or on a mobile-blocked viewport (no
keydown listener is ever attached there at all).

### Vim keys

| key | where | action |
|---|---|---|
| `j` / `k` | any list (Builds panels, Personnel, grep results) | move selection down/up |
| `h` | Builds repo tree, Personnel roles level | up one level |
| `gg` | Builds project list, Personnel lists, grep results, plus the file editor | jump to the first entry / top of the file (double-tap within ~500ms; a single `g` does nothing) |
| `G` | same lists, plus the file editor | jump to the last entry / bottom of the file |
| `Ctrl-d` / `Ctrl-u` | file editor (Builds repo files, Personnel role docs) | half-page scroll |

`gg`/`G` in the grep overlay respect the tension of also being a live text
box: a single `g` not followed by a second one within the window is typed
into the query as a literal character (so search terms starting with "g",
e.g. `grep.ts`, still work) — only a genuine double-tap or a bare `G`
triggers the jump.

### Grep overlay keys

| key | action |
|---|---|
| `/` | open (from anywhere); a bare `/` while typing is otherwise just a printable character |
| printable characters | append to the live query |
| `Backspace` | delete the last query character |
| `Ctrl-u` / `Ctrl-w` | clear the query |
| `↓` / `Ctrl-n` (or `Ctrl-j`) | next hit |
| `↑` / `Ctrl-p` (or `Ctrl-k`) | previous hit |
| `gg` / `G` | jump to the first / last hit |
| `Enter` | open the selected hit — routes to the owning view (Personnel/Builds/Retina-V/Profile) if the path maps to one, otherwise just closes |
| `Esc` / `Ctrl-c` | close, no navigation |

### Personnel filter (`f`)

| key | action |
|---|---|
| `f` | enter filter mode on the `>` prompt |
| any printable character | appended to the filter query; the entry list live-filters (case-insensitive substring on names) |
| `Backspace` | edit the filter query |
| `Esc` | clear the filter and exit filter mode |
| `Enter` | confirm the filter (exits typing; the filtered list stays applied) and returns to normal `j`/`k` navigation |

### Boot sequence / reboot

> Full keymap reference rewrite from `src/data/help.yaml` is Phase 6 — this
> section only documents the PLAN.md Phase 5B addition ahead of that.

A fresh browser tab plays the E.D.I.T.H boot sequence (`src/components/
BootSequence.svelte`, copy/config in `src/data/boot.yaml`) once before the
dashboard appears — unskippable while it runs (no key or click bypasses
it). It plays at most once per tab: a reload or a deep link later in the
same tab (sessionStorage flag) goes straight to the requested view.

| key / control | action |
|---|---|
| `r` (on the ready dashboard only) | replays the boot sequence |
| `↻ reboot` (status-bar right cluster, any view) | switches to the dashboard and replays the boot sequence |

## Architecture

- **Routes**: five static pages, `src/pages/{index,builds,personnel,profile,retina-v}.astro`.
  Each one SSRs `src/layouts/Shell.astro` wrapping a single
  `src/components/Terminal.svelte` island with an `initialView` prop
  matching its own route, so the first paint matches the URL with no
  client-side flash. Every subsequent view switch is client-side only
  (`history.pushState`, with `popstate` handled) — there's no full page
  reload once hydrated.
- **Islands**: `Terminal.svelte` owns the view state machine, the global
  keydown listener (design keymap, tmux prefix, modifier fall-through), and
  the mobile guard (`window.matchMedia('(min-width: 900px) and
  (pointer: fine)')`). It renders `Wallpaper`, `StatusBar`, `Dashboard` /
  `Builds` / `Personnel` / `Profile` / `TrackerView` (one per view), and
  `GrepOverlay` (always mounted, consulted first on every keydown).
  `Builds`/`Personnel` each delegate their own file-viewer state to a
  shared `Editor.svelte` via a `bind:this` + `handleKey(): boolean`
  contract.
- **Data flow**: `src/lib/data.ts` loads every `src/data/*.yaml` file
  (Vite `?raw` imports, parsed with the `yaml` package) into typed getters
  (`getSite()`, `getDashboard()`, `getProfile()`, etc.) that route pages
  call in their frontmatter and pass down as plain props — Svelte
  components never read the filesystem themselves. Content collections
  (`projects`, `personnel`) are defined in `src/content.config.ts` and
  fetched via `astro:content`'s `getCollection()`, also in each route
  page's frontmatter.
- **Generated artifacts** (`scripts/generate.mjs`, wired to
  `predev`/`prebuild`, or run directly via `pnpm generate`):
  - `public/generated/repos/<name>.json` — file tree + text contents for
    each of the three submodules under `repos/`, lazy-fetched by Builds
    when a repo is opened in panel [3].
  - `public/generated/grep-index.json` — a walk of the site's own source
    (`src/**`, `scripts/**`, `tests/**` except `goldens/`/`reference/`,
    plus a handful of root config files and this README), consumed by
    `GrepOverlay.svelte`.
  - `src/generated/commits/<repo>.json` — the build-time commit snapshot
    described above, imported statically (not fetched).
- **Fixture mode** (`PORTFOLIO_FIXTURES=1`, set by `pnpm build:fixtures`):
  the `projects` content collection switches to `fixtures/projects/*.md`
  (4 sample projects extracted verbatim from the design handoff, with
  matching `fixtures/commits/*.json` and `fixtures/grep-index.json`) so the
  visual-regression suite can do byte-for-byte pixel comparisons against
  goldens captured from the prototype's own fabricated sample data. The
  `personnel` collection, profile, dashboard, and tracker content are never
  fixture-switched — they're the prototype's real content already. Grep's
  own index file swap happens post-build (`pnpm build:fixtures` copies
  `fixtures/grep-index.json` over the built
  `dist/generated/grep-index.json` as its last step) so the exact same JS
  bundle runs in both goldens and production; only the JSON payload
  differs.

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
against hand-picked "looks right" screenshots — it compares against
goldens captured from the **actual prototype** (`design/Homepage.dc.html`,
vendored into `tests/visual/reference/` with its fonts patched to the same
self-hosted files the real site uses), replaying the same recorded
key/type recipes (`tests/visual/recipes.ts`) against both sides through the
identical capture pipeline (`tests/visual/pipeline.mjs`: fake clock
installed before navigation, a fixed `runFor` advance before *and* after
the recipe's actions, wait for fonts + network idle, screenshot with
animations disabled). Fixture-mode content (see above) is what makes a
pixel-for-pixel comparison possible at all, since the real Builds content
differs from the prototype's fabricated sample projects.

A small number of elements are masked rather than compared directly — the
live network meter's bar strip and readout text are driven by real
Resource Timing measurements a faked `Date` doesn't freeze, so their exact
pixels are non-deterministic by design; the mask targets a CSS-fixed
ancestor row rather than either element's own (measurement-dependent)
bounding box, so the masked region itself stays deterministic run to run.
The comparison threshold starts at `maxDiffPixels: 0`; a documented,
narrowly-scoped `maxDiffPixelRatio: 0.0005` relaxation is allowed only for
ordinary GPU/compositor antialiasing jitter (verified case-by-case by
inspecting the actual diff image, not applied blanket). See
`tests/visual/README-PIPELINE.md` for the full capture-order rationale and
a recorded determinism check across repeated `pnpm goldens` runs.

# PLAN.md — shevinum.dev v3 (terminal/tmux portfolio)

## Objective

Recreate the design handoff at `/Users/shev/Desktop/design_handoff_shevinum_dev` as a production Astro 7 + Svelte 5 + Tailwind 4 static site in this directory — pixel-identical to `design/Homepage.dc.html` (enforced by an automated visual-regression suite), fully keyboard-driven (design keymap + tmux prefix + vim keys), with **zero content in component code** (static content files + build-time GitHub data), three real repos browsable in-app as git submodules, live clickable commits, functional grep/personnel-search/`../`, and the three approved bug fixes.

## Context

### Sources of truth
- `design/Homepage.dc.html` — pixel/behavior truth (1,134 lines; includes all sample data in its `Component` class, lines 452–1130).
- `README.md` in the handoff — spec for behavior, tokens, live meter math, keymap, mobile policy.
- Assets: `design/assets/*` → copy to `public/assets/` (spiderman.svg used as CSS mask only, never `<img>`).

### Stack (researched 2026-08-17, exact versions)
- `astro@7.2.2`, `svelte@5.56.9`, `@astrojs/svelte@9.0.1`, `tailwindcss@4.3.3` via `@tailwindcss/vite@4.3.3` (NOT the deprecated `@astrojs/tailwind`), `@astrojs/check@0.9.10`, `@playwright/test@1.62.1`, `@fontsource/jetbrains-mono@5.3.0` (self-hosted; weights 400/500/700 imported per-weight).
- Node 26.7.0 + pnpm 11.20.0 present locally. Astro requires Node ≥22.12.
- Astro 7 specifics: content collections live in `src/content.config.ts` using `glob()` loader from `astro/loaders`; set `compressHTML: false` in `astro.config.mjs` (v7 default `'jsx'` collapses inline whitespace — pixel risk); we render doc panes with a custom per-line classifier, so the v7 markdown pipeline change is irrelevant.
- Svelte 5: runes (`$state`, `$derived`, `$props`), `onclick`/`onkeydown` attribute syntax, `<svelte:window onkeydown={...} />`.
- Tailwind 4: CSS-first. **Do NOT include preflight** (it would change UA defaults the prototype relies on). Import only theme+utilities layers; `global.css` replicates the prototype's base styles verbatim (`body{margin:0;background:#0b0f14}`, `a` colors, `@keyframes blk/swp/pls/png`).
- GitHub REST: `GET /repos/ShevinuM/{repo}/commits?per_page=15`, commit `html_url` for links, CORS open, unauthenticated 60 req/hr per IP (treat 304s as counting; cache client-side).
- Playwright: `toHaveScreenshot` (animations disabled by default), `mask:` locators, `page.clock.install()` fakes Date/timers/rAF/performance.

### User decisions (locked)
- Builds projects: **transcript-tts**, **SafePass**, **daily-tech-digest** (all `github.com/ShevinuM/<name>`, branch `main`) as git submodules under `repos/`.
- Commits: build-time snapshot (committed to repo) + client-side live refresh with graceful fallback.
- Fix all 3 confirmed bugs (below). Placeholder `resume.pdf` (clearly marked, documented swap).

### Approved bug fixes (deviations from prototype — everything else stays identical)
1. **Status bar order**: in Retina-V view the prototype renders `…4:profile 3:retina-v*`. Fix: window list always renders in numeric order 1–4 with the active one highlighted in place.
2. **Live clock**: prototype hardcodes `23:34` / `15-Aug-26`. Fix: live `HH:MM` (24h) and `DD-Mon-YY`, updating each minute.
3. **Personnel `q`**: prototype's `q` inside a company folder goes up one level while the hint says "q returns to the dashboard". Fix: `q`/`Esc` always return to dashboard; `h`/`Backspace`/`ArrowLeft`/`../` go up one level (hint text unchanged).

### Stated assumptions (check, don't improvise around)
- **Personnel search**: the `>` prompt at the bottom of the File Browser pane becomes a functional yazi-style filter: key `f` enters filter mode; typed text appears after `>`; live-filters the entry list (case-insensitive substring on names); `Esc` clears and exits filter mode, `Enter` confirms and returns to nav; `j`/`k` operate on the filtered list; position indicator reflects filtered count. Hint copy stays visually unchanged.
- **tmux prefix** (`Ctrl-b`, 2s timeout, `Esc` cancels; only `Ctrl-b` itself is preventDefault-ed, all other modifier combos fall through per spec; inactive while grep overlay is open or in mobile-block mode):
  `1`→builds `2`→personnel `3`→retina-v `4`→profile `n`→next window (1→2→3→4→1) `p`→prev `d`/`w`/`0`→dashboard.
- **Vim keys**: existing `j/k/h/l/Enter/q/Esc` per design, plus `gg`/`G` (first/last) in Builds file list, Personnel lists, grep results; in the editor view (when content overflows): `j/k` line scroll, `Ctrl-d/Ctrl-u` half page, `gg/G` top/bottom, with the status line position (`Top`/`nn%`/`Bot` and `line:col`) updating live.
- **Routing**: five static pages (`/`, `/builds`, `/personnel`, `/retina-v`, `/profile`) all render the same Shell + one `Terminal.svelte` island with an `initialView` prop; client-side view switches use `history.pushState` (no reload, no flash — matching prototype feel); `popstate` handled. Grep overlay is not a route.
- **Builds interactivity extension** (requested beyond prototype visuals; reuses existing visual language — selection `rgba(224,69,60,.22)`, focused panel = bright `#e0453c` border):
  - Number keys `0`–`4` focus that panel (lazygit-style). Default focus = panel [2] Files (which is why it has the bright border in the prototype — keep that as the focus indicator).
  - Panel [2] focused: `j/k` selects project (as prototype), pane [0] shows its rendered doc.
  - Panel [3] focused: `j/k` selects repo, `Enter` opens that repo's file tree in pane [0]; `j/k/Enter` descend, `h` goes up (at repo root, returns to project doc); `Enter` on a file opens the nvim-style editor view with real content + line numbers; `q`/`Esc` returns to Builds.
  - Panel [4] focused: `j/k` selects commit, `Enter` opens the commit's `html_url` in a new tab. All commit rows are also mouse-clickable links (target=_blank, rel=noreferrer).
- **Mobile block** (<900px width or coarse pointer): terminal not rendered/hidden via CSS media query + matching JS guard (no key listeners, no meter/clock timers); centered terminal-styled card per spec copy, `github.com/shevinum` escape hatch. Prototype has no mobile view → verified by e2e assertions + one reviewed golden of our own.

### Architecture — content out of components
- `src/content/projects/*.md` — one per Builds project. Frontmatter: `title`, `order`, `repos: [{name, github, branch}]` (first repo `mark:"*"`, rest `"•"` derived by position), body = markdown for pane [0]. Real content: transcript-tts, SafePass, daily-tech-digest (seeded from their GitHub descriptions/READMEs, concise, in the site's voice).
- `src/content/personnel/<Company>/<role>.md` — frontmatter: `company`, `role`, `months`, `dates`, `loc`, `order`; body = doc. Content = **exactly the prototype's** (Enaimco ×3, Vretta ×1, Ontario-Tech ×2, Freelance ×1). Company display order in `src/data/companies.yaml`.
- `src/data/*.yaml` (or .json) — profile fields + summary, record-database stats, contact rows, map places/labels, tracker subjects + HUD panel text, toasts copy, dashboard plate/menu/footer lines, status-bar session string + window names, hints, grep mode-line strings, mobile-block copy, coordinates. **Every user-visible string lives here or in content/.**
- `src/lib/docline.ts` — classifies raw md body lines into the prototype's kinds (`h`,`m`,`p`,`b`,`c`) with the prototype's exact colors; unit-tested to reproduce the prototype's kind arrays for all fixture docs.
- Build-time generation (`scripts/generate.mjs`, run via `predev`/`prebuild`):
  - `public/generated/repos/<name>.json` — file tree + text contents per submodule (skip `.git` [a FILE in submodules], binaries by extension+size cap 200KB, lockfiles). Fetched lazily by the island when a repo is opened.
  - `public/generated/grep-index.json` — walks the site's own source (`src/**`, `scripts/**`, root configs, `README.md`; excludes `node_modules,.git,dist,.astro,public/generated,repos,tests/**/goldens,pnpm-lock.yaml`). `{path, lines[]}`.
  - `src/generated/commits/<repo>.json` — snapshot `{sha8, msg (first line), html_url, initials}` via GitHub API (uses `GITHUB_TOKEN` if set); on API failure keeps the existing committed snapshot and warns. Imported statically (Builds renders identically offline).
- Client commit refresh: on first Builds open per session, fetch per repo, sessionStorage cache (10 min TTL); replace list on success, keep snapshot silently on failure.
- Live meter (`Meter.svelte` + `src/lib/net.ts`): implement README §Live meter exactly — 60 bars, one rAF loop writing styles directly to bar nodes (never framework re-render), `navigator.connection` → Resource Timing fallback, probe `Image()` on `/assets/icon-mail.svg?t=` every 2500ms smoothed 0.6/0.4, hue `212 − 212·h^0.85`, envelope `0.36+0.5q`, `q=log10(1+Mbps)/log10(51)`, detuned sines, clamp `[0.07, 1−0.18·lag]`, readout `X.X Mb/s · NNN ms · TYPE` / `offline`. Initial bar markup: `height:8%; background:#2a5f7a; border-radius:1px` (matches prototype initial DOM — keeps visual diffs mask-free except the readout).

### Fixture strategy (what makes 100% visual checks possible)
Real Builds content differs from the prototype's fabricated sample data, so pixel diffs use **fixture mode**: when env `PORTFOLIO_FIXTURES=1`, loaders/imports switch to `fixtures/` — containing the prototype's exact data extracted verbatim from `Homepage.dc.html`: 4 sample projects (name/repos/commits/doc), the 24-file `repoSrc` grep snapshot, sample commits. Personnel/profile/dashboard/tracker content is the real content already (identical to prototype). The visual suite builds with fixtures; a production build (real content) additionally gets structural smoke screenshots (no prototype goldens) and the full e2e suite.

### Visual-regression harness (Phase 1, used by every later phase)
- Vendor the handoff into `tests/visual/reference/` (prototype html + support.js + assets) so golden regeneration is self-contained. The reference is never shipped (not in `src`/`public`).
- **Font parity (critical)**: patch the vendored reference's Google Fonts `<link>` to load the exact same Fontsource woff2 files the site uses (`@fontsource/jetbrains-mono` 400/500/700, served locally). Goldens and implementation must render from byte-identical font files; capture then needs no internet.
- **Pin the rendering stack**: `@playwright/test` pinned exactly (no `^`) — goldens are only valid for the Chromium build that captured them; upgrading Playwright requires regenerating goldens in the same change (README workflow note).
- `tests/visual/recipes.ts` — shared state recipes: `01-dashboard []`, `02-builds [b]`, `03-builds-j [b,j]`, `04-personnel-l0 [x]`, `05-personnel-l1 [x,Enter]`, `06-editor [x,Enter,Enter]`, `07-profile [i]`, `08-tracker [t]`, `09-grep-empty [/]`, `10-grep-query [/, type "svelte"]`.
- Capture pipeline (identical for goldens and impl): viewport **1512×945** and **1920×1080**, deviceScaleFactor 1, `page.clock.install({time:'2026-08-15T23:34:00'})` **before load**, then after load `page.clock.runFor()` a fixed sub-60s amount (e.g. `'05'` seconds) **identically on both sides** — this flushes any rAF/timer-driven first render (the prototype shim may need it) while keeping the displayed minute at `23:34` (impl clock renders `23:34`/`15-Aug-26` = prototype's hardcoded text; meter bars advance deterministically-enough to be masked — mask the whole meter strip if the runFor makes bars diverge), wait for `document.fonts.ready` + network idle, animations disabled, masks = net-readout span (+ meter bars container if needed per above; per-side locators; geometry must match).
- **Network determinism**: `identical.spec.ts` and the golden capture both route-abort `**/api.github.com/**` — the commit-refresh island fires on Builds mount (fetch, not timer), and fixture repos must not depend on 404-ing by luck.
- `pnpm goldens` (`tests/visual/capture-goldens.mjs`) serves the reference statically and writes `tests/visual/goldens/<viewport>/<state>.png` (20 goldens).
- `tests/visual/identical.spec.ts` — fixture build + preview server, replays recipes, `toHaveScreenshot` against goldens. Threshold: start `maxDiffPixels: 0`; if antialiasing noise appears, an executor may relax to at most `maxDiffPixelRatio: 0.0005` per shot **with a comment justifying it**, and the verifier must eyeball the diff images.
- Playwright `webServer` config owns all servers (reference server + astro preview). Ports: 4400 reference, 4321 dev, 4322 preview.

## Steps

### Phase 1 — Scaffold + visual harness + goldens
- [x] `git init`; `.gitignore` (`node_modules/`, `dist/`, `.astro/`, `test-results/`, `playwright-report/`, `.DS_Store`).
- [x] `package.json` (pnpm), install exact stack; `astro.config.mjs` (svelte integration, tailwind vite plugin, `compressHTML: false`, `site: "https://shevinum.dev"`, static output); `src/styles/global.css` (Tailwind theme+utilities, NO preflight; prototype base styles + keyframes verbatim; `@theme` tokens for the design palette); fontsource imports; `tsconfig`.
- [x] Copy `design/assets/*` → `public/assets/`; vendor handoff → `tests/visual/reference/` and patch its font `<link>` to the local Fontsource woff2 files (font parity).
- [x] Stub `src/pages/index.astro` + minimal Shell so `pnpm build` exercises the real pipeline.
- [x] Playwright setup: config with the two servers, two viewport projects; `recipes.ts`; `capture-goldens.mjs`; run `pnpm goldens` → 20 PNGs.
- [x] Placeholder `public/assets/resume.pdf` (valid 1-page PDF, clearly marked placeholder).
- [x] Commit.
- **Verify**: `pnpm build` succeeds on the empty-shell site; `ls tests/visual/goldens/1512x945 | wc -l` = 10 and `1920x1080` = 10; goldens visually match my earlier prototype screenshots (spot-check 01, 07, 08); reference server script exits cleanly; resume.pdf opens as a valid PDF (`file` says PDF, non-zero pages).

### Phase 2 — Data layer (content, fixtures, submodules, generators)
- [x] `src/content.config.ts` (projects + personnel collections, zod schemas, glob loaders with env-switched `base` for fixtures); write all content files: 3 real project .md, 7 personnel .md (prototype text verbatim), `src/data/*.yaml` for every remaining string (audit the prototype HTML top-to-bottom so no copy is left hardcoded anywhere).
- [x] Extract fixtures from `Homepage.dc.html` verbatim: `fixtures/projects/*.md` (4 sample projects incl. commits+repos as frontmatter/JSON), `fixtures/grep-index.json` (24-file `repoSrc` — note: the prototype's own "22 tracked files" copy is a miscount; the data has 24 entries and the visible counter renders 24/24), `fixtures/commits/*.json`.
- [x] `git submodule add` transcript-tts, SafePass, daily-tech-digest under `repos/`; init/update.
- [x] `scripts/generate.mjs` (+ `predev`/`prebuild`/`pnpm generate`): repo indexes, grep index, commits snapshots (offline-safe); commit generated snapshots.
- [x] `src/lib/docline.ts` + unit tests (node:test): classifier reproduces the prototype kind arrays for all 11 fixture docs exactly; grep `search()` port with the prototype's exact ordering/cap/ellipsis semantics + unit tests.
- [x] Commit.
- **Verify**: `node --test` green; `pnpm generate` produces all JSONs with expected schema/counts (3 repo indexes with >0 text files each; grep index contains `src/` paths; 3 commit snapshots with sha8+html_url matching `github.com/ShevinuM/`); `git submodule status` shows 3 initialized; collections actually load in both normal and `PORTFOLIO_FIXTURES=1` modes, probed explicitly (`astro sync` in each mode plus a throwaway page or loader log that proves entry counts: 3 real / 4 fixture projects, 7 personnel); grep of `src/components src/layouts src/pages` for copy strings ("Flerken", "welcome back", "SPIDER-VARIANT", "Recruited into software") returns nothing (dirs may not exist yet → trivially pass).

### Phase 3 — Shell, wallpaper, status bar, dashboard, toasts, core keymap/router
- [x] `Shell.astro` (fonts, global css, mobile-block card markup slot), 5 route pages passing content props, `Terminal.svelte` island (view state, pushState/popstate, global keydown incl. modifier fall-through), `Wallpaper.svelte` (map, rings, sweep, subjects, HUD boxes — all from data), `StatusBar.svelte` (live clock via minute interval; **bug fix 1+2**: numeric window order, active-in-place highlight), `Dashboard.svelte` (plate, menu, footer, hover/hotkeys), `Toasts.svelte` (dismissible, dashboard-only).
- [x] Run `mcp__svelte__svelte-autofixer` (via ToolSearch) over every new .svelte component until clean.
- [x] Commit.
- **Verify**: visual `01-dashboard` passes both viewports; e2e: `b/p/x/i/t` switch views (status bar text asserted for each — including `3:retina-v*` rendered **between** 2:personnel and 4:profile), `q`/`Esc` return, URL updates on switch and back/forward work, toasts ✕ removes toast, `cmd+l`-style modifier combos not intercepted (assert no preventDefault on a modifier keydown), clock: `page.clock` advance 1 min → status-bar text changes accordingly.

### Phase 4 — Retina-V (tracker) view
- [ ] Tracker view = wallpaper at full opacity + back pill (dismissible ✕, `[q] back to dashboard`); wallpaper opacity 0.72 elsewhere per prototype (`wallOpacity` logic).
- [ ] Commit.
- **Verify**: visual `08-tracker` passes both viewports; e2e: `t` from dashboard/builds, `q`/`Esc` back, pill ✕ hides pill until view re-entered (matches prototype `offBack` reset on entry).

### Phase 5 — Builds view (lazygit) + submodule browsing + commits
- [ ] `Builds.svelte`: five panels exactly (inset titles, counts from data: `{repoCount} repos · {projectCount} projects tracked`), project selection j/k + click, doc rendering via docline, repos panel, commits panel from snapshot, command-log panel (copy from data).
- [ ] Editor note (from Phase 2 verify): the status-line words `Top`/`Bot` must come from data files (builds.yaml/personnel.yaml), not be hardcoded in the component.
- [ ] Panel focus via `0–4` (bright-border indicator, default [2]); repo tree browsing in pane [0] (lazy-fetch `public/generated/repos/<name>.json`); editor view for repo files (line numbers, live `line:col` + Top/%/Bot, j/k/Ctrl-d/Ctrl-u/gg/G scrolling); commits: j/k + Enter → `html_url` new tab; rows are real `<a>` links.
- [ ] Client-side commit refresh island logic (sessionStorage TTL, silent fallback).
- [ ] Svelte autofixer pass. Commit.
- **Verify**: visual `02-builds` + `03-builds-j` pass (fixture mode) both viewports; e2e (real content build): 3 projects listed, j/k moves selection + doc changes, `4` focuses commits (border color asserted) and Enter opens correct `html_url` (popup intercepted), commit rows have `href` matching `github.com/ShevinuM/<repo>/commit/<sha>`, `3` focuses repos → Enter lists real files from the submodule index (assert a known file e.g. `README.md` present), descend into a dir and open a file → editor shows its first line verbatim vs the file on disk, `h` walks back up, `q` exits editor; commit refresh: intercept API route with a fake commit → list updates; API 403 → snapshot list unchanged.

### Phase 6 — Personnel Files (yazi) + editor + filter + `../`
- [ ] `Personnel.svelte`: two panes, bottom-aligned list, roles table (grid `minmax(0,1fr) 44px 170px 100px`), level nav (companies ⇄ roles), `../` row functional at both levels (up / dashboard), editor view (reuse Phase 5 editor with prototype styling: NORMAL bar, `⑂ main`, breadcrumbs, `esc to close`), **bug fix 3** (`q`/Esc → dashboard always; h/Backspace/← up), `f` filter mode on the `>` prompt (live filter, Esc clears+exits, Enter confirms, indicator reflects filtered count).
- [ ] Svelte autofixer pass. Commit.
- **Verify**: visual `04/05/06` pass both viewports; e2e: full nav matrix (j/k wrap, Enter descends/opens editor, h/../ up, q from roles level → **dashboard**, q in editor → browser), filter: `f` then "co" filters to matching entries (`software-developer-co-op.md`), position indicator updates, Esc restores full list, typed chars while NOT in filter mode still act as nav keys.

### Phase 7 — Profile view + live meter + resume
- [ ] `Profile.svelte`: header row (clipped AGENT PROFILE tab, FILE/CLEARANCE, [q] close), title block, 3-col grid `196px minmax(0,1fr) 232px`, images (exact object-fit/position/filters/captions), fields grid, scrollable SUMMARY, Retina-V capture (max-height 38.5% alignment), RECORD DATABASE / CV / CONTACT panels (icon `<img>`s), SIGNAL footer + `Meter.svelte` (exact README math), `r` opens `/assets/resume.pdf`, coords label.
- [ ] Svelte autofixer pass. Commit.
- **Verify**: visual `07-profile` passes both viewports (readout masked); e2e: `r` opens the pdf (popup/download asserted), CV link downloads, contact hrefs exact (github/linkedin/mailto; discord row is NOT a link), meter: with real clock, two rAF frames apart bar heights differ and `repeating-linear-gradient` background set (style attr asserted), readout matches `/^(offline|\d+(\.\d)? Mb\/s · \d+ ms · [A-Z0-9]+)$/`, offline emulation → `offline`; summary panel scrolls (`overflow-y:auto` + scrollHeight > clientHeight at 945px? — if content fits, assert the overflow style only).

### Phase 8 — Grep overlay
- [ ] `GrepOverlay.svelte`: dimmed blurred backdrop, two panes + footer hints, prompt with block cursor, hit counter `hits/total`, mode line, path+content search (exact prototype semantics: path-hit row first per file, 400 cap, 24-char left-cut ellipsis, match highlight), ResizeObserver row-fit (22px rows / 21px preview lines, selection-visible clamping), preview centered on hit with real line numbers + hit-line highlight, keys: printable/Backspace/Ctrl-u/Ctrl-w/↑↓/Ctrl-n/p/j/k/Enter/Esc/Ctrl-c, Enter routes to the owning view (mapping from path → view over real site paths: `content/personnel|Personnel` → personnel, `content/projects|Builds` → builds, `Tracker|Wallpaper|subjects` → retina-v, `Profile` → profile, else just close), `/` opens from every view incl. editor.
- [ ] Svelte autofixer pass. Commit.
- **Verify**: visual `09/10` pass both viewports (fixture index reproduces the prototype's 24-file snapshot: identical rows, counts `24/24` empty and `N/M` for "svelte", identical preview); e2e on real index: `/` from profile opens overlay, typing filters (a known real path e.g. `src/lib/grep.ts` findable by its own name), Enter on a personnel content hit lands in personnel view, Esc closes back to prior view, Ctrl-u clears, counter format `X/Y` correct against the real index JSON.

### Phase 9 — tmux prefix, vim extras, mobile block, README
- [ ] Prefix state machine per assumptions (2s timeout, Esc cancel, only Ctrl-b preventDefault-ed, disabled in grep/mobile); `gg`/`G` in the three lists; editor Ctrl-d/u (if not already in P5).
- [ ] Mobile block: media query + JS guard (no listeners/timers in blocked mode), card copy from data, escape-hatch link.
- [ ] Project `README.md`: quickstart, content-editing workflows (add/remove project + submodule, add role, edit profile/site data, refresh commits snapshot, regenerate goldens, update submodules), keymap reference (design + tmux + vim), architecture map, resume.pdf swap note, deploy note (static `dist/`).
- [ ] Svelte autofixer pass. Commit.
- **Verify**: e2e: Ctrl-b 2 → personnel, Ctrl-b n/p cycle in order, Ctrl-b d → dashboard, prefix timeout (advance clock 2.1s, then `2` types/nothing happens instead of switching), Ctrl-b ignored while grep open; gg/G jump first/last in builds files + personnel + grep; iPhone-15-ish emulation (390×844, coarse pointer): card visible with spec copy, terminal hidden, pressing `b` does nothing, no key listener attached (assert via evaluating a marker), github link present; 1512×945 fine-pointer: card hidden. README exists and names every workflow above (verifier reads it).

### Phase 10 — Full acceptance run
- [ ] Verifier-only phase (no new code unless failures loop back to the owning phase's executor).
- **Verify**: acceptance criteria below, all runs from clean checkout state (`git status` clean → `pnpm install && pnpm generate && pnpm check && pnpm build && pnpm test:visual && pnpm test:e2e`).

## Verification commands (canonical)
- `pnpm generate` — build-time data generation.
- `pnpm check` — `astro check` + `svelte-check` + `tsc --noEmit` (as wired).
- `pnpm build` / `pnpm build:fixtures` (`PORTFOLIO_FIXTURES=1 astro build`).
- `pnpm goldens` — regenerate goldens from the vendored reference.
- `pnpm test:visual` — fixture build + 20 golden comparisons.
- `pnpm test:e2e` — behavioral suite on the real-content build.
- `node --test` — unit tests (docline, grep search, indexer helpers).

## Acceptance criteria (definition of done)
1. Clean pipeline: `pnpm install && pnpm generate && pnpm check && pnpm build` all exit 0.
2. **Visual: all 20 golden comparisons pass** at the agreed thresholds (target 0 diff; any relaxation ≤ `maxDiffPixelRatio 0.0005` with in-file justification and verifier-inspected diff images).
3. Full e2e suite green (keymap, tmux prefix, vim keys, grep, personnel nav/filter/`../`, builds panel focus + repo browsing + commit links + refresh fallback, meter, live clock, resume, toasts, mobile block, URL routing).
4. Unit tests green.
5. No content in components: grepping `src/components src/layouts src/pages` for the audit list of copy strings returns zero hits; all copy lives in `src/content/`, `src/data/`, or `public/generated`+`src/generated`.
6. 3 submodules initialized and browsable in-app; commits snapshot committed; live refresh verified with mocked API.
7. Bugs 1–3 fixed, each covered by a test.
8. README documents every content workflow.
9. All work committed to git with the submodules recorded in `.gitmodules`.

## Stop conditions (scope guard)
- No deployment setup, no GitHub repo creation/push, no CI config (README note only).
- No content invention beyond: prototype copy (verbatim), the 3 chosen repos' project blurbs, placeholder resume.
- No extra views/features beyond this plan. Anything discovered as "would be nice" goes to the final report, not the code.

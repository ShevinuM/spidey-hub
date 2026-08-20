# Project structure

SpideyHub is an Astro 7 + Svelte 5 static site. Every route SSRs once; after
that the whole app runs client-side inside one hydrated Svelte island. This
doc maps the repo layout and the two conventions that hold it together: the
three-way content/data/generated split, and the per-view component folder
pattern.

## Top-level layout

```
src/
  pages/          6 Astro routes (see below) — SSR shell, frontmatter-only data loading
  layouts/        Shell.astro — the shared <head>/wrapper every page renders through
  components/     Svelte islands — 6 view folders (state-class pattern) + 14 flat components
  lib/            29 pure TypeScript modules — no Svelte runes, most are unit-tested directly
  content/        7 Zod-validated Markdown collections (astro:content)
  data/           13 hand-authored YAML files — UI copy, read via src/lib/data.ts
  generated/      build-time TS/JSON artifacts imported statically (src/generated/)
  content.config.ts   collection definitions (schema + loader) for every src/content/* dir
public/
  generated/      build-time JSON artifacts fetched at runtime (public/generated/)
  assets/         static images/SVGs/resume.pdf
scripts/
  generate.mjs           writes every generated/ artifact (predev/prebuild hook)
  capture-screenshots.mjs   writes docs/screenshots/*.png from a real build
tests/
  unit/           node --test, 335 tests — pure src/lib logic, no browser
  e2e/            Playwright, 21 spec files, 454 tests × 2 viewports = 908 runs
  visual/         golden screenshot suite — pipeline.mjs, recipes.ts, goldens/
docs/             this file + architecture.md, how-to-run.md, screenshots/, changes/
fixtures/         deterministic stand-ins for src/content/repositories + generated JSON,
                  used only when PORTFOLIO_FIXTURES=1 (the visual suite's fixture build)
repos/            8 real git submodules, the actual repos Repositories browses
```

### Routes

Six static pages, `src/pages/{index,repositories,employment,retina-v,profile,help}.astro`.
Each one SSRs `src/layouts/Shell.astro` wrapping a single `Terminal.svelte` island with
an `initialView` prop matching its own route, so first paint matches the URL with no
client-side flash. Every subsequent view switch is client-side only
(`history.pushState`); `ViewId` (`src/lib/views.ts`) is
`home | repositories | employment | retina-v | profile | help`, and the status bar's six
windows are `0:dashboard 1:repos 2:employment 3:retina-v 4:profile 5:help`.

## The three-way split: content vs. data vs. generated — and why two "don't hand-edit" folders

The repo keeps three places for non-component text/data, not two, because they answer
three different questions and collapsing any pair of them loses information:

| location | question it answers | who writes it | validated? |
|---|---|---|---|
| `src/content/**/*.md` | "what does this record say" — prose/records a human authored | a human, by hand | yes — Zod schema per collection (`content.config.ts`) |
| `src/data/*.yaml` | "what UI chrome string appears here" — copy tightly coupled to a component's own templating/layout | a human, by hand | no — read as raw YAML via `src/lib/data.ts`, no schema |
| `src/generated/` + `public/generated/` | "what did a build script compute" — derived from `repos/`, `src/content/**`, or a live API call | `scripts/generate.mjs`, never a human | shape enforced by the generator itself, not by a runtime schema |

**Why content and data are two folders, not one.** Both are hand-authored, but they fail
differently when someone gets the shape wrong. `src/content/*` holds anything a reviewer
would want validated as a *record* — a role's dates, a project's repo list, a
notification's severity enum — so a bad edit fails `astro check`/build immediately against
a Zod schema, and each entry is independently addressable (one file = one role, one
project, one notification) the way a database row is. `src/data/*.yaml` holds UI-chrome
strings that are small, componentwise, and often geometry-coupled (status-bar labels, grep
chrome, ASCII-art padding, `{placeholder}`-substituted templates) — schema-validating
every nested string in a file like `dashboard.yaml` would add ceremony with no payoff,
since a typo there is caught by simply looking at the page, not by a type error. The
dividing line in practice: **would a human ever want this validated as a record with its
own identity?** Personnel roles and repository docs — yes, hence collections. Dashboard
menu labels and grep-overlay chrome — no, hence YAML.

**Why generated data lives in two folders (`src/generated/` vs `public/generated/`), not
one.** Both hold machine-written output from `scripts/generate.mjs` and neither is ever
hand-edited — the split between them is a *loading* distinction, not an authoring one:

- `public/generated/*.json` is fetched at runtime (`fetch("/generated/...")`) by code
  that needs the data lazily or client-side — `repos/<name>.json` (loaded only once a
  repo is opened in Repositories), `fs-index.json` (the shell's `ls`/`cat`/`tree`),
  `grep-index.json` (the grep overlay), `contributions.json` (the live contribution grid).
- `src/generated/**` is imported statically at build time (`import data from
  "../generated/commits/x.json"`) so the bundle contains it directly — `commits/*.json`
  (the commit snapshot Repositories renders on first paint, before any client fetch) and
  `file-icons.json` (needed synchronously wherever a file icon renders).

Merging them into one folder would force every consumer onto whichever loading strategy
the *other* consumer needed — either a static import bloating the bundle with data that's
only needed lazily, or a runtime fetch adding a network round-trip to data that's needed
for the very first paint. Keeping the split lets each artifact's own access pattern pick
its own loading mechanism.

## Component folder + state-class pattern

Every non-trivial view lives in its own folder under `src/components/<name>/` with three
kinds of file:

- **`<Name>.svelte` — orchestrator.** `$props`, the full keymap (`handleKey(): boolean`,
  called by `Terminal.svelte`'s dispatch chain), any exported API, top-level layout, and
  wiring of children. This file is the component's public identity — everything else in
  the folder is private to it.
- **`<name>State.svelte.ts` — one state class.** A single class holding every `$state` /
  `$derived` / `$effect` for the view (Svelte's "runes in modules" file convention:
  `.svelte.ts`, not `.ts`, is what lets a plain module use runes). Children receive the
  state instance as a constructor prop and call its methods to mutate it — no context, no
  stores, no parallel state machine. Exactly one state class per view.
- **Child `.svelte` components, one per major markup region** — panels, overlays, repeated
  row chrome. Pure presentation; they read the state instance's fields and call its
  methods.

Real examples:

```
src/components/repositories/
  Repositories.svelte           orchestrator — keymap, panel focus/digit-key routing
  repositoriesState.svelte.ts   RepositoriesState — repo/file/commit selection, tree cache
  StatusPanel.svelte            panel [0]
  RepositoriesPanel.svelte      panel [1]
  FilesPanel.svelte             panel [2]
  PreviewPanel.svelte           panel [3]
  CommitsPanel.svelte           panel [4]
  CommandLog.svelte             panel [5]

src/components/employment-records/
  EmploymentRecords.svelte          orchestrator
  employmentRecordsState.svelte.ts  EmploymentRecordsState — flat-list selection, index stats
  RecordsPanel.svelte               left panel (row list)
  PreviewPanel.svelte               right panel (file preview)
  TimelinePanel.svelte              middle panel (spiderweb + spine + nodes)

src/components/terminal/
  Terminal.svelte              orchestrator — global keydown delegation, mobile guard
  terminalState.svelte.ts      TerminalState — tmux client model (sessions/windows/panes)
```

`editor/`, `grep-overlay/`, and `notifications/` follow the identical shape. Pure logic
with no runes (parsers, pickers, formatters) goes in `src/lib/*.ts` instead of a state
class — a state class holds reactive view state, not standalone functions a unit test can
call directly.

The remaining components stay flat in `src/components/` (no folder) because they're
either small, single-file, and unlikely to grow (`Meter.svelte`, `Wallpaper.svelte`,
`PanelBadge.svelte`) or genuinely simple single-purpose overlays (`Cmdline.svelte`,
`ChooseTree.svelte`, `CopyMode.svelte`, `BootSequence.svelte`, `HelpView.svelte`,
`HelpSearch.svelte`, `Profile.svelte`, `PaneTree.svelte`, `Dashboard.svelte`,
`StatusBar.svelte`) — applying the full folder+state-class split to a component with no
meaningfully separable panels or reused row chrome would add files without reducing
complexity anywhere.

## Content collections (`src/content.config.ts`)

| collection | shape | fixture-switched? |
|---|---|---|
| `repositories` | one project doc per file, `{title, order, repos[]}` | yes — `fixtures/repositories/*.md` under `PORTFOLIO_FIXTURES=1` |
| `personnel` | one role per file, depth-generic path (backs Employment Records) | no |
| `profile` | single file, full profile page schema | no |
| `help` | one scope per file (14 files — one per keymap scope) | no |
| `notifications` | one notification per file (30 files — the seeded pool) | no |
| `boot` | single file, boot-log entries | no |
| `command-log` | single file, Repositories panel [5] body lines | no |

Fixture mode (`PORTFOLIO_FIXTURES=1`, set by `pnpm build:fixtures`) exists solely so the
visual-regression suite can do byte-for-byte pixel comparisons without coupling goldens to
real project content — see `docs/architecture.md`'s "Fixture mode" section for the full
mechanics.

# How to run

## First time

```sh
pnpm install
git submodule update --init --recursive   # the 8 Repositories projects are real submodules
pnpm generate                              # writes public/generated/**, src/generated/**
```

`pnpm generate` also runs automatically before `pnpm dev`/`pnpm build`
(`predev`/`prebuild` in `package.json`), so day to day you can usually just run `pnpm dev`
or `pnpm build` directly. Run it manually to refresh the derived JSON without a full dev
server/build — e.g. after updating a submodule checkout, editing `src/content/**`, or
wanting a fresh contribution-grid/commit snapshot.

## Commands

| command | what it does |
|---|---|
| `pnpm install` | install dependencies (pnpm workspace, `packageManager` pinned) |
| `pnpm generate` | regenerate `public/generated/repos/*.json`, `public/generated/fs-index.json`, `public/generated/grep-index.json`, `public/generated/contributions.json`, `src/generated/commits/*.json`, `src/generated/file-icons.json` |
| `pnpm dev` | `astro dev` at `http://localhost:4321`, live-reloading |
| `pnpm build` | production build (real content) to `dist/` |
| `pnpm build:fixtures` | fixture-mode build (`PORTFOLIO_FIXTURES=1`) — used by the visual suite only |
| `pnpm preview` | serve the last `pnpm build` output via Astro's own (daemonizing) preview server — stop with `npx astro preview stop` |
| `pnpm check` | `astro check` + `tsc --noEmit` + `svelte-check --threshold error` |
| `pnpm test:unit` | `node --test tests/unit/*.test.ts` — 335 tests of pure `src/lib/*.ts` logic, no browser |
| `pnpm test:e2e` | real-content build + the full Playwright behavioral suite — 21 spec files, 454 tests × 2 viewports = 908 runs |
| `pnpm test:visual` | fixture build + 42 golden screenshot comparisons (21 recipes × 2 viewports) |
| `pnpm goldens` | historical/guarded — regenerates goldens against the vendored ORIGINAL design prototype, refuses to run without `--restore-prototype-parity`; not the normal re-baseline path |

Run the full gate before any change is considered done:

```sh
pnpm check && pnpm test:unit && pnpm test:e2e && pnpm test:visual
```

## Rebaselining visual goldens

Only when a change *deliberately* changes what a golden should show — never to make a
refactor's diff pass (see `docs/architecture.md`'s "Golden rebaseline policy"):

```sh
pnpm build:fixtures && pnpm exec playwright test tests/visual/identical.spec.ts --update-snapshots
```

Then run `pnpm test:visual` **three consecutive times** and confirm all three pass clean
— a golden that only passes intermittently after `--update-snapshots` baked in something
non-deterministic (a live measurement, an un-flushed timer, GPU rasterization jitter), and
the fix is to root-cause that nondeterminism, not to re-run `--update-snapshots` until it
happens to pass once. Finally, inspect every new/changed `.png` yourself (not just the
byte diff) for rendering defects before committing.

## Screenshots (`docs/screenshots/*.png`)

```sh
node scripts/capture-screenshots.mjs
```

Runs a real `pnpm build` (real submodule repos, real personnel content, the live
contribution grid — not fixture data), serves `dist/` on a scratch port, and replays the
same keystroke sequences `tests/visual/recipes.ts` already proved reach each named state,
capturing 12 PNGs at 1512×945 into `docs/screenshots/`. Re-run it whenever a UI change
should be reflected in the README/docs images.

## `GITHUB_TOKEN` (optional)

Set `GITHUB_TOKEN` in the environment before `pnpm generate`/`pnpm build` to raise
GitHub's unauthenticated rate limit (60 req/hr per IP) and unlock the GraphQL
contribution-calendar path:

- **Commit snapshots** (`src/generated/commits/<repo>.json`, 15 most recent commits per
  submodule): fetched via the GitHub REST API either way; a token just avoids rate-limit
  failures on repeat runs. If a fetch fails, the existing committed snapshot is left
  untouched and a warning is printed — `pnpm generate` never deletes a snapshot it can't
  refresh.
- **Contribution grid** (`public/generated/contributions.json`): a 3-way fallback chain,
  attempted in order —
  1. **GraphQL** (`contributionsCollection.contributionCalendar`) — only attempted when
     `GITHUB_TOKEN` is set; this is the only path with an authenticated, structured API,
     since GitHub has no unauthenticated REST equivalent for contribution data.
  2. **HTML scrape** of the public `github.com/users/<owner>/contributions` page
     (`td.ContributionCalendar-day` elements, reading `data-level`/`data-date`) — used
     whenever no token is set, or the GraphQL call fails.
  3. **Stale snapshot** — if both of the above fail, the previously committed
     `contributions.json` is left untouched (never deleted), same "don't destroy good data
     on a bad run" policy as the commit snapshots.

  `pnpm generate`'s console output names which path actually ran (`(live)` / `(scrape)` /
  `(unchanged)`), so a real run's provenance is always visible, not assumed.

The client also does its own live refresh of commit data once per session
(`sessionStorage`-cached for 10 minutes) with a silent fallback to the snapshot on
failure — the checked-in snapshot is what a fresh visitor's first paint always shows.

## Fixtures

`fixtures/` holds every deterministic stand-in the visual suite needs so its goldens never
couple to real, ever-changing project/commit data: `fixtures/repositories/*.md` (sample
projects), `fixtures/commits/*.json`, `fixtures/repos/all-projects.json`,
`fixtures/grep-index.json`, `fixtures/fs-index.json`, `fixtures/contributions.json`
(seeded, deterministic). They're read only when `PORTFOLIO_FIXTURES=1` — see
`docs/architecture.md`'s "Fixture mode" section for exactly which pieces switch and how.
`pnpm test:unit`'s `all-projects-fixture.test.ts` guards `fixtures/repos/all-projects.json`
against drifting from `fixtures/repositories/*.md` — see that test file's own header for
the regeneration snippet if you ever hand-edit a fixture project doc.

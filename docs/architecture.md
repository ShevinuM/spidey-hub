# Architecture

## Stack

- **Astro 7.2.2**, `output: "static"` — every route is pre-rendered HTML at build time,
  no server runtime to provision.
- **Svelte 5.56.9** (runes mode) — one hydrated island per page (`Terminal.svelte`), the
  only client-side JavaScript the site ships beyond it.
- **TypeScript 5.7.3**, strict — every `.ts`/`.svelte.ts` module and every component.
- **Tailwind CSS 4.3.3** (`@tailwindcss/vite`) for utility layout; component-scoped
  `<style>` blocks for anything bespoke (most of the terminal chrome).
- **Playwright 1.62.1**, pinned exact (no `^`) — the visual goldens are only valid for the
  exact Chromium build that captured them; bumping the pin requires a re-baseline in the
  same change.
- No server framework, no database, no CI configured in this repository — `pnpm build`
  produces a fully static `dist/` deployable to any static host.

## Data flow (three sources, one direction)

Components never read the filesystem or fetch config themselves. Everything flows one
way, resolved in each page's Astro frontmatter and passed down as props/data:

1. **`src/data/*.yaml` — hand-authored UI copy.** Loaded by `src/lib/data.ts` (Vite `?raw`
   imports, parsed with the `yaml` package) into typed getters (`getSite()`,
   `getDashboard()`, `getRepositories()`, etc.). No schema — these are UI-chrome strings,
   not records (see `docs/project-structure.md` for the full content-vs-data rationale).
2. **`src/content/**/*.md` — hand-authored content collections.** Defined and
   Zod-validated in `src/content.config.ts`, fetched via `astro:content`'s
   `getCollection()`/`getEntry()`. A bad frontmatter value fails the build, not just a
   visual review.
3. **`src/generated/` + `public/generated/` — machine-generated JSON.** Written by
   `scripts/generate.mjs` (wired to `predev`/`prebuild`, or run directly via `pnpm
   generate`). Never hand-edited. See `docs/project-structure.md` for why this is split
   into two folders by loading strategy (static import vs. runtime fetch).

## Coding standards (Svelte 5 runes)

- Declare local reactive state with `$state`, never a plain `let` mutated after mount.
- Derive a value from other reactive state with `$derived`/`$derived.by` — never compute
  it inside an `$effect`. `$effect` is reserved for real side effects (DOM measurement,
  subscriptions, timers, focus management).
- Wrap a one-shot mount-time read of reactive state in `untrack()` inside `$effect` so the
  effect doesn't re-fire when that value changes later (see `repositoriesState.svelte.ts`'s
  own mount-time reads for the pattern in practice).
- **Key every `{#each}` over a list that can reorder, filter, or have items
  added/removed** — `{#each windows as win (win.id)}` (`StatusBar.svelte`),
  `{#each state.grepRows as r (r.idx)}` (`grep-overlay/QueryListPanel.svelte`). The key
  ties each DOM node to the item's own identity across re-renders instead of a fixed
  array index, which matters the moment the list reorders or shrinks. An unkeyed each is
  only acceptable for a list that's always fully replaced wholesale (e.g.
  `{#each row.keys as k}` over a fixed, static array literal).
- Type every `$props()` destructure with an explicit `interface Props`, never `any`.
- One state class per view (`<name>State.svelte.ts`, "runes in modules" — see
  `docs/project-structure.md`'s component-pattern section) — never split a view's
  reactive state across several ad hoc classes or a mix of module-level and
  component-level runes.
- Default a Svelte island's hydration directive to `client:visible` unless it's above the
  fold on first paint (`client:load`).
- Never call `fetch`/`getCollection`/other data loads at the top level of a script Astro
  executes during SSR render of a client-hydrated island — load in the `.astro`
  frontmatter, pass down as a prop.

## Pure-lib vs. component split

`src/lib/*.ts` holds every piece of logic that has no Svelte runes and no DOM dependency —
parsers (`cmdline.ts`, `vim.ts`, `grep.ts`), pickers (`notifications.ts`), formatters
(`docline.ts`, `commandLog.ts`), the tmux client model (`tmux.ts`), boot math (`boot.ts`).
The rule that keeps this enforceable rather than aspirational: **a module a unit test
`import`s directly must stay DOM-free and rune-free** — no `astro:content`, no
browser-only global, no `$state`. If a piece of logic needs reactive state, it belongs in
a `<name>State.svelte.ts` class instead, not in `src/lib/`. This split is why `pnpm
test:unit` can exercise 335 tests of real application logic with zero browser and zero
Astro build step — every one of them imports straight from `src/lib/`.

## Testing gates

Four independent suites, each catching a different class of regression:

| suite | command | what it covers | count |
|---|---|---|---|
| type/lint | `pnpm check` | `astro check` + `tsc --noEmit` + `svelte-check --threshold error` | — |
| unit | `pnpm test:unit` | pure `src/lib/*.ts` logic, `node --test` | 335 tests |
| e2e | `pnpm test:e2e` | real build, full Playwright behavioral suite, 21 spec files | 454 tests × 2 viewports = 908 runs |
| visual | `pnpm test:visual` | fixture build, pixel-identical golden comparison | 21 recipes × 2 viewports = 42 goldens |

All four gate every change; none is optional for a change that touches the code they
cover.

### Lessons from the iteration-6 post-mortem

See `docs/post-mortems/2026-08-21-iteration-6.md` for the full account of how 8
user-visible defects shipped while every one of the four suites above passed. The
short version: each suite's determinism requirements structurally exclude the exact
conditions a real first-time visitor experiences — fixture mode disables every
`infinite` CSS animation and the visual pipeline separately freezes animation at
capture time, so a dead keyframe renders identically to a live one; the shared e2e
fixture pre-seeds "boot already seen" for every spec but `boot.spec.ts`, so a
boot↔notification interaction goes untested from both directions; fixture content is
fixed-length and never overflows a panel. None of that reflects a lapse in following
the golden rebaseline procedure below — the sampled rebaselines were all tied to a
named, deliberate visual-change commit. The fixes it justifies:

- Never verify a CSS animation with `getComputedStyle(el).animationName` — it
  returns the declared name whether or not that name resolves to a real keyframes
  rule. Use `el.getAnimations().length > 0` (animation already in effect) or look
  the name up against `document.styleSheets` for a matching `CSSKeyframesRule`.
- A component-local `@keyframes` referenced from an inline `style="..."` attribute
  must use Svelte's global form (`@keyframes -global-<name>`) — Svelte rewrites a
  plain component-scoped declaration's name but never rewrites the markup that
  references it, so the two silently stop matching otherwise. See `b885c18` for the
  convention applied across `NotificationBell.svelte`, `ToastStack.svelte`,
  `NotificationsPanel.svelte`, and `TimelinePanel.svelte`.
- A new scrollable/overflowable panel ships with an overflow/scrollability
  assertion; a new feature touching boot or first-visit state ships with at least
  one non-fixture, cold-boot e2e check (opt out of the shared fixture's boot-skip,
  as `tests/e2e/boot.spec.ts` and `tests/e2e/notifications-boot.spec.ts` do).
- A bug fix lands with both its reproducing test and any fixture data needed to
  reproduce it, in the same commit.

### Golden rebaseline policy — never during a refactor

The visual suite's goldens (`tests/visual/goldens/<viewport>/<recipe>.png`) are
**self-baselines**: they assert "does the implementation still render what it rendered
last time we deliberately accepted a UI change," not a fixed external target. That makes
them a genuine safety net for pure refactors — a component relocation, a state-class
extraction, a rename — specifically **because** they're expected to stay byte-identical
through one. The rule this implies, and the one most likely to be violated under time
pressure:

**Never rebaseline a golden to make a refactor's diff pass.** If a change advertised as
"pure relocation, no behavior change" produces a pixel diff, that diff is signal that the
relocation wasn't pure — investigate and fix the regression, don't silently
`--update-snapshots` it away. Rebaseline only in the same commit as a *deliberate* visual
change, using the canonical procedure:

```sh
pnpm build:fixtures && playwright test tests/visual/identical.spec.ts --update-snapshots
```

followed by the determinism gate — `pnpm test:visual` three consecutive clean runs — and
a manual visual inspection of every changed PNG (not just the byte diff) before
committing. See `tests/visual/README-PIPELINE.md` for the full historical rationale and
every prior re-baseline's determinism-check record.

## Fixture mode

`PORTFOLIO_FIXTURES=1` (set only by `pnpm build:fixtures`, never by `pnpm dev`/`pnpm
build`) switches the `repositories` content collection to `fixtures/repositories/*.md` —
a small, fixed set of sample projects — with matching `fixtures/commits/*.json`,
`fixtures/repos/all-projects.json`, `fixtures/grep-index.json`,
`fixtures/fs-index.json`, and `fixtures/contributions.json`. All four of those
(`grep-index.json`, `repos/all-projects.json`, `fs-index.json`, `contributions.json`) are
copied over their built `dist/generated/` counterparts as `build:fixtures`'s last steps
rather than generated, so the exact same JS bundle runs in both goldens and production —
only the JSON payloads differ. `personnel`, `profile`, and `help` content is never
fixture-switched (there's no cross-recipe determinism need for them). Fixture mode also
disables every CSS `infinite` animation site-wide, so a golden never has to fight a
running keyframe for pixel stability. It never leaks into `pnpm dev`/`pnpm build`/`pnpm
test:e2e` — those set no such env var, so a real visitor and the e2e suite both always see
real content.

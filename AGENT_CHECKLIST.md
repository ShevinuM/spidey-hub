# Agent checklist

Enforceable, one-line, checkable rules. Every rule states a constraint, not
a rationale — see `docs/architecture.md` and `docs/project-structure.md` for
the "why" behind any of these. Per `CLAUDE.md`'s rule, this file is updated
in the same change as any `docs/` edit that affects a convention below.

## Before calling a change done

- [ ] `pnpm check` clean (0 errors).
- [ ] `pnpm test:unit` green (335 tests as of this writing — pure `src/lib/*.ts` logic).
- [ ] `pnpm test:e2e` green (real build, 21 spec files, 454 tests × 2 viewports).
- [ ] `pnpm test:visual` green (fixture build, 21 recipes × 2 viewports = 42 goldens) —
      unless the change is docs-only/test-only with zero rendering impact.
- [ ] `git status tests/visual/goldens` clean, UNLESS this change deliberately
      changes the UI and the rebaseline procedure (below) was followed.

## Golden rebaseline policy

- [ ] Never rebaseline a golden to make a pure-refactor's diff pass — a diff on a
      change advertised as "no behavior change" is a regression to fix, not a
      snapshot to update.
- [ ] Rebaseline only in the same commit as the deliberate visual change that
      caused the diff: `pnpm build:fixtures && pnpm exec playwright test
      tests/visual/identical.spec.ts --update-snapshots`.
- [ ] After any rebaseline, run `pnpm test:visual` three consecutive times and
      confirm all three pass clean before committing.
- [ ] Visually inspect every changed `.png` yourself (not just the byte diff) for
      rendering defects — blank panels, clipped text, missing overlays.
- [ ] Never hand-edit a golden PNG.

## Project structure

- [ ] Keep every user-visible string out of `.svelte`/`.astro` component bodies —
      source it from `src/data/*.yaml` (via `src/lib/data.ts`) or a `src/content`
      collection.
- [ ] Keep generated/derived files (anything `scripts/generate.mjs` writes) under
      `src/generated/` or `public/generated/` — never hand-edit a generated file.
- [ ] Keep one `src/lib/*.ts` module's exports pure and DOM-free when a unit test
      type-imports it — no `astro:content`/browser-only import in a module
      `tests/unit/*.test.ts` imports, no Svelte runes.
- [ ] A non-trivial view lives in `src/components/<name>/` as an orchestrator +
      exactly one `<name>State.svelte.ts` state class + panel/overlay children —
      never split a view's state across multiple classes or add a second one.

## Content vs. data vs. generated (the human-editing test)

- [ ] Put content a human would write/edit as prose or a record — role docs,
      project docs, help copy, notification text — in a Zod-validated
      `src/content/*` Markdown collection.
- [ ] Put machine-generated or derived data — anything a script computes or a
      build step emits — in a generated JSON/TS artifact, never hand-authored.
- [ ] Put small UI-chrome strings tightly coupled to a component's own
      rendering/templating (error templates, ASCII-art padding, position/geometry
      pairs, `{placeholder}` strings) in `src/data/*.yaml`, read through a typed
      accessor in `src/lib/data.ts`.
- [ ] Choose `public/generated/` vs. `src/generated/` by loading strategy, not
      habit: runtime `fetch()` consumers go in `public/generated/`; anything a
      component statically `import`s at build time goes in `src/generated/`.
- [ ] Never re-derive an ordering field when the natural key already sorts
      correctly — only add an explicit `order` field when the natural sort is wrong.

## Naming conventions (post-rename — verify before adding a new reference)

- [ ] The Repositories view/route/collection is `repositories` everywhere:
      `ViewId` value, route (`/repositories`), content collection
      (`src/content/repositories`), YAML (`repositories.yaml`), component folder
      (`src/components/repositories/`), testids (`repositories-*`), status-bar
      window name `repos`. Never reintroduce `builds`/`Builds` in an identifier,
      testid, route, or user-facing copy.
- [ ] The Employment Records view/route is `employment` everywhere: `ViewId`
      value, route (`/employment`), component folder
      (`src/components/employment-records/`), testids (`employment-*`),
      status-bar window name `employment`. Never reintroduce "Personnel Files"
      in user-facing copy (the `src/content/personnel/` collection directory
      name itself is intentionally NOT renamed — that's a legitimate internal
      reference, distinct from banned UI copy).
- [ ] The virtual all-projects repo's name stays literally `all-projects`
      (both in code and content) — do not rename it as part of any future sweep.

## Svelte 5 runes

- [ ] Declare local reactive state with `$state`, not a plain `let` mutated
      after mount.
- [ ] Derive a value from other reactive state with `$derived`/`$derived.by`,
      never inside an `$effect`.
- [ ] Use `$effect` only for a real side effect (DOM measurement, subscription,
      timer, focus) — never to compute a value another rune could derive.
- [ ] Wrap a one-shot mount-time read of reactive state in `untrack()` inside
      `$effect` so the effect doesn't re-fire on that value's later changes.
- [ ] Type every `$props()` destructure with an explicit `interface Props`,
      never `any`.
- [ ] Key every `{#each}` over a list that can reorder, filter, or change length.

## Astro islands hydration

- [ ] Default a Svelte island's hydration directive to `client:visible` unless
      it's above the fold on first paint (`client:load`).
- [ ] Never call `fetch`/`getCollection`/other data loads at the top level of a
      script Astro executes during SSR render of a client-hydrated island — load
      in the `.astro` frontmatter and pass down as a prop.

## Accessibility

- [ ] Give every interactive `<div>`/`<span>` a `role`, a `tabindex`, and a
      keyboard handler mirroring its click behavior.
- [ ] Mark every decorative/purely-visual inline SVG `aria-hidden="true"`.
- [ ] Give every focusable element a visible `:focus-visible` style — never
      `outline: none` without a replacement.
- [ ] Gate a non-essential CSS animation behind
      `@media (prefers-reduced-motion: no-preference)`, and disable it entirely
      under `fixtureMode` (site convention — every `infinite` animation must be).
- [ ] Declare a component-local `@keyframes` referenced from an inline
      `style="..."` attribute using Svelte's global form
      (`@keyframes -global-<name>`) — a plain component-scoped declaration
      never resolves an inline `animation:` reference, since Svelte rewrites
      the declaration but not the markup that points at it.

## Performance

- [ ] Render a static image through `astro:assets`'s `<Image>`/`getImage`, never a
      bare `<img src>` for a local file.
- [ ] Set explicit `width`/`height` (or `aspect-ratio`) on every image to avoid
      layout shift.
- [ ] Preload only the font weights/styles actually used above the fold — never
      preload a whole font family speculatively.

## Testing

- [ ] Every time a bug surfaces (self-found or user-reported), write a test that
      covers it — a unit test if the bug is reachable that way, else an
      integration/e2e test, in that order of preference.
- [ ] Land a bug fix together with BOTH its reproducing test AND any fixture
      data needed to reproduce it, in the same commit.
- [ ] Write a unit test for pure logic with no DOM/browser dependency.
- [ ] Write an e2e test only for user-observable behavior, exercised against a
      real build.
- [ ] Never verify a CSS animation with
      `getComputedStyle(el).animationName` — it returns the declared name
      whether or not that name resolves to a real keyframes rule. Assert
      `el.getAnimations().length > 0` for an animation already in effect, or
      look the name up against `document.styleSheets` for a matching
      `CSSKeyframesRule`.
- [ ] Ship a new scrollable/overflowable panel with an overflow/scrollability
      assertion (`overflowY`/`overflowX`, `scrollHeight > clientHeight`,
      wheel/keyboard scroll actually moves `scrollTop`).
- [ ] Ship a new feature that interacts with boot or first-visit state with at
      least one non-fixture, cold-boot e2e check (opt out of the shared e2e
      fixture's boot-skip, the way `tests/e2e/boot.spec.ts` does).
- [ ] Keep a visual golden deterministic: seed fixtures, disable/freeze
      animations, mask genuinely non-deterministic content (live measurements,
      timestamps, random picks).
- [ ] Use the existing `testid` prefix convention for a new element in an
      existing view (`repositories-*`, `employment-*`, `notifications-*`, etc.) —
      never introduce an unprefixed or inconsistently-prefixed testid.

## Commit style

- [ ] Single-line, imperative commit message — no body, no trailer (no
      `Co-Authored-By`).
- [ ] One reviewable unit of work per commit.

## Comment hygiene

- [ ] State only a current constraint in a comment — never a plan, iteration,
      phase, or "locked decision" reference.
- [ ] Delete a comment instead of updating it once the constraint it describes
      no longer holds.
- [ ] Never restate what the next line of code already says.

## User-facing copy

- [ ] Write copy a first-time visitor with zero context can understand without
      any implementation knowledge.
- [ ] Keep copy truthful to the feature's actual current behavior — update it
      in the same commit the behavior changes.
- [ ] Never expose a file path, repo reference, or internal/implementation term
      in user-facing copy.
- [ ] Use one consistent product name for a given feature everywhere it's
      mentioned.

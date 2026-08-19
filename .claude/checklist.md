# Conventions checklist

Enforceable, one-line, checkable rules. Every rule states a constraint, not a rationale.

## Project structure

- Keep every user-visible string out of `.svelte`/`.astro` component bodies — source it from `src/data/*.yaml` (via `src/lib/data.ts`) or a `src/content` collection.
- Keep generated/derived files (anything `scripts/generate.mjs` writes) under `src/generated/` or `public/generated/` — never hand-edit a generated file.
- Keep one `src/lib/*.ts` module's exports pure and DOM-free when a unit test type-imports it — no `astro:content`/browser-only imports in a module `tests/unit/*.test.ts` imports.

## Content vs. data (the human-editing test)

- Put content a human would write or edit as prose/records — bios, help copy, notification text, narrative lines — in a zod-validated `src/content/*` Markdown collection.
- Put machine-generated or derived data — anything a script computes or a build step emits — in a generated JSON/TS artifact, never hand-authored.
- Put small UI-chrome strings that are tightly coupled to a component's rendering/templating logic (error templates, ASCII-art padding, position/geometry pairs, code-substituted `{placeholder}` strings) in `src/data/*.yaml`, read through a typed accessor in `src/lib/data.ts`.
- Never re-derive an ordering field (e.g. `order`) when the natural key already sorts correctly (e.g. alphabetically) — only add an explicit order field when the natural sort is wrong.

## Svelte 5 runes

- Declare local reactive state with `$state`, not a plain `let` that's mutated after mount.
- Derive a value from other reactive state with `$derived`/`$derived.by`, never inside an `$effect`.
- Use `$effect` only for a real side effect (DOM measurement, subscription, timer, focus) — never to compute a value another rune could derive.
- Wrap a one-shot mount-time read of reactive state in `untrack()` inside `$effect` so the effect doesn't re-fire on that value's later changes.
- Type every `$props()` destructure with an explicit `interface Props`, never `any`.

## Astro islands hydration

- Default a Svelte island's hydration directive to `client:visible` unless it's above the fold on first paint.
- Use `client:load` only for a component visible immediately on page load (no scroll needed).
- Never call `fetch`/`getCollection`/other data loads at the top level of a script that Astro executes during SSR render of a client-hydrated island — load in the `.astro` frontmatter and pass down as a prop.

## Accessibility

- Give every interactive `<div>`/`<span>` a `role`, a `tabindex`, and a keyboard handler that mirrors its click behavior (WAI-ARIA APG pattern for that role).
- Mark every decorative/purely-visual inline SVG `aria-hidden="true"`.
- Give every focusable element a visible `:focus-visible` style — never `outline: none` without a replacement.
- Gate a non-essential CSS animation behind `@media (prefers-reduced-motion: no-preference)` or pause it under `(prefers-reduced-motion: reduce)`.

## Performance

- Render a static image through `astro:assets`'s `<Image>`/`getImage`, never a bare `<img src>` for a local file.
- Set explicit `width`/`height` (or `aspect-ratio`) on every image to avoid layout shift.
- Preload only the font weights/styles actually used above the fold — never preload a whole font family speculatively.

## Testing

- Write a unit test (`pnpm test:unit`, `node --test`) for pure logic with no DOM/browser dependency.
- Write an e2e test (`pnpm test:e2e`, Playwright) only for user-observable behavior, exercised against a real build.
- Keep a visual golden deterministic: seed fixtures, disable/freeze animations, mask dynamic content (timestamps, random picks).
- Never hand-edit a visual golden PNG — regenerate it with `--update-snapshots`.
- Re-baseline visual goldens only in the same commit as the visual change that caused the diff, gated by 3 consecutive clean `pnpm test:visual` runs.

## Commit style

- Write a single-line, imperative commit message — no body, no trailer.
- Keep one reviewable unit of work per commit.

## Comment hygiene

- State only a current constraint in a comment — never a plan, iteration, phase, or "locked decision" reference.
- Delete a comment instead of updating it once the constraint it describes no longer holds.
- Never restate what the next line of code already says.

## User-facing copy

- Write copy a first-time visitor with zero context can understand without any implementation knowledge.
- Keep copy truthful to the feature's actual current behavior — update it the same commit the behavior changes.
- Never expose a file path, repo reference, or internal/implementation term in user-facing copy.
- Use one consistent product name for a given feature everywhere it's mentioned (e.g. always "Retina-V", never a mix of names).

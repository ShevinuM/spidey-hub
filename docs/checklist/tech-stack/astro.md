# Astro

Framework-specific rules for content collections, images, and islands hydration.

## Content collections

- [ ] **R001** Every collection gets an explicit loader + Zod schema in its collection config — never an untyped/loader-less collection. A collection with a fixed set of files uses `glob`; a single computed/aggregated source uses `file` or a custom loader.
- [ ] **R002** A collection-level schema takes precedence over a loader's own schema — use the collection schema to narrow or extend what a shared loader provides, rather than forking the loader itself.
- [ ] **R003** After adding or changing a collection schema, sync the content layer (restart dev / re-run the content step) before trusting the generated types — a stale content-layer cache is a common source of "impossible" type errors.
- [ ] **R004** A custom loader clears its store and re-validates every entry through `parseData` on each load — never hand-append to the store bypassing schema validation.

## Images

- [ ] **R005** A local image under `src/` renders through `astro:assets`'s `<Image />` or `<Picture />`, never a bare `<img src>` — this prevents cumulative layout shift (dimensions are inferred automatically) and gets build-time optimization for free.
- [ ] **R006** An above-the-fold image gets the `priority` attribute so `loading`/`decoding`/`fetchpriority` are set for immediate load — a below-the-fold image is left to its lazy default. Don't set `priority` on every image; it defeats its own purpose.
- [ ] **R007** Use `<Picture />` (not `<Image />`) only when multiple output formats/sizes are genuinely needed (e.g. serving `avif`/`webp` with a fallback) — `<Image />` is the default for a single-format image.

## Islands & hydration

- [ ] **R008** Default a Svelte island's hydration directive to `client:visible` unless it's above the fold on first paint, in which case use `client:load` — hydrating every island eagerly defeats the point of the islands architecture.
- [ ] **R009** Never call `fetch`/`getCollection`/another data load at the top level of a script a client-hydrated island executes during SSR render — load the data in the `.astro` page's frontmatter and pass it down as a prop. A load inside the island's own script re-runs on the client, duplicating the work and risking a client/server data mismatch.

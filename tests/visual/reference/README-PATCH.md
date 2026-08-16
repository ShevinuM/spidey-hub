# Vendored reference — patches applied

This directory is a vendored, byte-for-byte copy of
`design_handoff_shevinum_dev/design/` (`Homepage.dc.html`, `support.js`,
`assets/`), used only to regenerate visual-regression goldens
(`pnpm goldens`). It is never shipped (not under `src/` or `public/`).

Exactly two behavioral edits were made to `Homepage.dc.html`, both required
by PLAN.md's "goldens must not depend on the network" constraint. No other
line was touched — `support.js` and `assets/` are unmodified.

## 1. Font parity (required by PLAN.md)

The original `<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap">`
was replaced with three local stylesheet links:

```html
<link href="fonts/400.css" rel="stylesheet">
<link href="fonts/500.css" rel="stylesheet">
<link href="fonts/700.css" rel="stylesheet">
```

`fonts/{400,500,700}.css` are verbatim copies of
`@fontsource/jetbrains-mono`'s own per-weight CSS files (the same files
`src/styles/global.css` imports), each with multiple `@font-face` blocks
(one per unicode-range subset: cyrillic-ext, cyrillic, greek, vietnamese,
latin-ext, latin) — copying the whole multi-subset file, not a hand-rolled
single `@font-face`, keeps fallback-glyph behavior (e.g. the non-Latin
glyphs the design never uses) identical to the real site. `font-family`
stays `'JetBrains Mono'`. `fonts/files/*.woff2` are the 18 files
(6 subsets × 3 weights) those CSS files reference.

Goldens and the implementation now render from byte-identical font files —
capture needs no internet.

## 2. React/ReactDOM vendoring (required for the same reason, discovered during Phase 1)

`support.js`'s `init()` runs `loadReactUmd().then(init)` unconditionally.
`loadReactUmd()` fetches React 18.3.1 and ReactDOM 18.3.1 UMD production
builds from `unpkg.com` (with SRI) *unless* `window.React` and
`window.ReactDOM` already exist — Homepage.dc.html has no local copy, so the
unpatched reference cannot render offline (and made every golden capture
depend on `unpkg.com` being reachable).

Fix: two `<script>` tags were added to `<head>`, before `<script
src="./support.js">`:

```html
<script src="./vendor/react.production.min.js"></script>
<script src="./vendor/react-dom.production.min.js"></script>
```

`vendor/react.production.min.js` and `vendor/react-dom.production.min.js`
are byte-for-byte copies of the exact CDN files support.js pins
(`react@18.3.1`/`react-dom@18.3.1` UMD production min builds) — downloaded
once and verified against support.js's own `REACT_SRI` / `REACT_DOM_SRI`
(sha384) constants before vendoring:

- react.production.min.js: `sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z` ✓
- react-dom.production.min.js: `sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1` ✓

Because `window.React`/`window.ReactDOM` are present by the time
`loadReactUmd()` runs, it resolves immediately without any network request.
This intentionally does **not** use support.js's `window.__resources`
override mechanism: setting `window.__resources` also suppresses the
same-origin `fetch(location.href)` re-parse inside `boot()` (a different
code path than the DOM `innerHTML` parse used on first load), which would
mean capturing goldens from a render path the pristine reference doesn't
normally take. Preloading the globals via plain `<script>` tags leaves every
other code path — including that re-fetch, which is same-origin to the
local static server and therefore not a "network dependency" in the sense
the constraint cares about — exactly as in the original.

No `x-import`/Babel vendoring was needed: Homepage.dc.html has no
`<x-import>` tags and its `data-dc-script` block never returns JSX (it
returns plain prop objects consumed by the `{{ }}`/`sc-for`/`sc-if` template
bindings), so `ensureBabel()` is never invoked.

## Verification

A before/after visual diff (unpatched reference loading the real CDN vs.
this patched reference, dashboard state) was captured at the 1512×945
viewport through the same capture pipeline used for goldens
(tests/visual/pipeline.mjs). The two PNGs are not byte-identical: 559 of
1,428,840 pixels differ (0.0391%), all clustered around anti-aliased text
edges near the top-right toasts, with a max per-channel delta of 48. That
is ordinary font-rasterization jitter (glyphs loaded via a `<link
rel=stylesheet>` chain vs. Google Fonts' own chain paint in a
different-enough order to shift AA sub-pixel rounding by ~1 unit at some
edges) — it is well under PLAN.md's pre-authorized
`maxDiffPixelRatio: 0.0005` relaxation ceiling and is not a structural
difference. No content, layout, or color regions differ. Only one viewport
was checked directly; the change (adding two `<script>` tags to `<head>`
and swapping a `<link>`'s `href`s) has no viewport-dependent code path, so
1920×1080 was not independently re-run.

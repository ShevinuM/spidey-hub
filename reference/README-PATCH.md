# Vendored reference — patches applied

This directory holds two vendored design handoffs. Nothing in it is shipped
(it is not under `src/` or `public/`).

- **The original Homepage handoff**: a byte-for-byte copy of
  `design_handoff_shevinum_dev/design/` (`Homepage.dc.html`, `support.js`,
  `assets/`). It is still the only input for `pnpm goldens`.
- **The v2 design-review export** (see "v2 design-review export" below): the
  Builds v2, Employment v2 and Profile v2 pages, the old Builds and Employment
  pages, `RadarWall.dc.html`, their change notes and the assets they use.
  Page splits read it as their design source, served on port 4400 by
  `src/common/tests/ui/support/static-server.mjs`.

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

## v2 design-review export

### Source

Copied on 2026-10-08 from `/Users/shev/Downloads/BuildsPageDesignReview/`.
That export folder is dated 2026-10-05. It lives in `~/Downloads` and can change
or disappear, which is why every copied file's hash is recorded here.

### Files and hashes

Every file below is a byte-for-byte copy of its source, except the five
patched pages. For those, the "vendored" column is the hash of the patched
file in this folder. The "source" column is the hash of the unpatched export
file (and of the pre-patch copy).

| File | Source sha256 | Vendored sha256 (patched pages only) |
|---|---|---|
| `Builds v2.dc.html` | `6dc2c79ccfd73f4f150b09e008f149d813cb40048696fa3c7a2d976b4d6783cf` | `71eefc3c58ec2f69f496fe1440a16d35a283a04987bc7539046f5ffdd5e02297` |
| `Employment v2.dc.html` | `1da7da1f96da38f7bdd93609d7433c390be056c7539d34f668860b1aa16df64d` | `5323c44f279334c3bbd4f763ee079fad92b0fa6cff9520816fdd90bccd98ffba` |
| `Profile v2.dc.html` | `955e801c9817ef9b54f4b6cf6d616ac7a01170efffc892f74839e0c91b835241` | `70d34b4f5d682c44e87344695c5b7a09e11375131460c08d2443cc21593616f3` |
| `Builds.dc.html` | `7a23d01f1f731369c625371e2f5a980299d37affadf32747c2724586eefe9c95` | `33bb5e9395f186d2aeb3731ccfc098a30168079344cf5979ed721995c1993816` |
| `Employment.dc.html` | `0dab50c67fcbb0fb7336471ab9073528315b2899d80eec13d04b50cb60db8a9f` | `d6b60cc1b594f6738688cb47107cef5c5daaf82928adba1709ac5ba58dedb897` |
| `RadarWall.dc.html` | `1a111101f350cf156c7dc3c33648c3ad208ba788354f2c211aa2550bdbf1438e` | — (unpatched) |
| `Builds-v2-Changes.md` | `4d38ea0381cd1b6b5962f00be2cd9c5b75d5833d5f3821098004c1dd048f6fa2` | — (unpatched) |
| `Employment-v2-Changes.md` | `5060374c4a68b3eb78978dfae0e8c7e413c25299d38d67fd9512c1396bb2432e` | — (unpatched) |
| `github.md` | `114c4f6bd017968f9b66f654d61ac2281dce06720f9debbd174f5e9de5f0bcf8` | — (unpatched) |
| `assets/github-mark.svg` | `8e294b16399c797ed548985ae8890d8f095542d49267cf6681960708ef5b101e` | — (unpatched) |
| `assets/spider-glyph-red.svg` | `ff52fa66ab9586ffd5b0dbfc1d01a97aff4a8faf01475dea96be2d7253f3ed8f` | — (unpatched) |
| `assets/spider-glyph-blue.svg` | `2bd77b13fd2271db723661d2721e7ca807b79c6a158e047fdbd8e67ea1c0979c` | — (unpatched) |
| `assets/spider-glyph-teal.svg` | `ed427e2a35fe5c14bde357f2de7b15e09b4ea488b00c287a65b6178f4a5dcc55` | — (unpatched) |
| `assets/spider-glyph-gold.svg` | `25b55dad238b239c1a10f623cb467934b1780540abd6d4ebdda30f1e33a0f5f3` | — (unpatched) |
| `assets/spider-web-red.svg` | `ce9c9446081edab78c4aa3e2644aef331752445915dbffacf71b3fc3bd93dadd` | — (unpatched) |
| `assets/spiderman3-logo.svg` | `8fcf785bf89c22abf450eae07d10a4d0a150d2d54dd0128e67f46f541897c944` | — (unpatched) |

### Patches

The same two edits were applied to each of `Builds v2.dc.html`,
`Employment v2.dc.html`, `Profile v2.dc.html`, `Builds.dc.html` and
`Employment.dc.html`, in the same form as Homepage's. No other line changed.

**1. Font parity.** In the `<helmet>` at the top of `<x-dc>`, these three lines
were removed:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
```

`Builds v2.dc.html` spells two of them differently: `crossorigin=""` and
`&amp;display=swap`. In their place, as the helmet's first children:

```html
<link href="fonts/400.css" rel="stylesheet"><link href="fonts/500.css" rel="stylesheet"><link href="fonts/700.css" rel="stylesheet">
```

The `<helmet>` tag's attributes are unchanged. All five pages use only weights
400, 500 and 700, which `fonts/{400,500,700}.css` cover.

**2. No network.** In `<head>`, immediately before
`<script src="./support.js"></script>`, two comment blocks
(`<!-- FONT PARITY PATCH … -->`, `<!-- REACT VENDOR PATCH … -->`) and these two
tags were added:

```html
<script src="./vendor/react.production.min.js"></script>
<script src="./vendor/react-dom.production.min.js"></script>
```

As with Homepage, none of the five pages has an `<x-import>`, and their
`data-dc-script` blocks return plain prop objects. `ensureBabel()` never runs,
so Babel needs no vendoring.

**`RadarWall.dc.html` is unpatched.** It has no font link. Its only script tag
(`./support.js`) never runs, because the pages load it through `dc-import`,
which parses only its `<x-dc>` block. Its assets (`pin-target.svg`, `pin.svg`,
`spiderman.svg`, `flerken.svg`) are already in `assets/`. Don't open it on its
own: standalone, its `support.js` fetches React from unpkg.

### Not copied

- `support.js`: its sha256 is identical to `support.js` here.
- `assets/flerken.svg`, `assets/pin-target.svg`, `assets/pin.svg`,
  `assets/spiderman.svg`: they differ from the copies here only in whitespace.
  `diff -w` is not empty, because it doesn't ignore line breaks: the export
  joins the `<?xml?>` prologue and the `<svg>` tag onto one line. The copy of
  `spiderman.svg` here also encodes the newlines inside its path data as
  `&#xA;` entities, where the export uses spaces. A character reference
  survives attribute normalization as a real LF, and SVG path grammar treats
  LF as whitespace, so the rendered shapes are the same. Equality check (run
  from the repo root, with `SRC` the export folder; the two hashes match for
  each file):

  ```sh
  for f in flerken pin-target pin spiderman; do
    sed 's/&#xA;/ /g' "$SRC/assets/$f.svg" | tr -d ' \t\r\n' | shasum -a 256
    sed 's/&#xA;/ /g' "reference/assets/$f.svg" | tr -d ' \t\r\n' | shasum -a 256
  done
  ```

  The existing bytes stay, so Homepage golden parity is unchanged.
- `fonts/webslinger-subset.woff2`: only Dashboard uses it.
- Out-of-scope designs and notes: `Dashboard.dc.html`, `Help.dc.html`,
  `Builds-Panel-Changes.md`, `Dashboard-Panel-Changes.md`,
  `Help-Panel-Changes.md`, `Personnel-Panel-Changes.md`,
  `notifications-handoff-prompt.md`.
- Assets no vendored page references: `spider-web.svg`, `spider-glyph.svg`,
  `spiderman-teal.svg` (Help only), `spiderman4-logo.svg`,
  `spiderman3-logo-plate.svg`.
- Export working material: `uploads/`, `shots/`, `scraps/`, `.thumbnail`,
  `.DS_Store`.

### Verification

Each page was loaded at 1512×945 in Playwright Chromium from
`static-server.mjs reference 4400`, waiting for `networkidle` and
`document.fonts.ready`. Before patching, every page made 4 external requests:
Google Fonts CSS, its font file, and the two unpkg React builds.

| Page | Requests | External | Failed (≥400) | `[dc-runtime]` errors | JetBrains Mono loaded | Radar wall |
|---|---|---|---|---|---|---|
| Builds v2 | 19 | 0 | 0 | 0 | yes | yes |
| Employment v2 | 23 | 0 | 0 | 0 | yes | yes |
| Profile v2 | 19 | 0 | 0 | 0 | yes | yes |
| Builds | 19 | 0 | 0 | 0 | yes | yes |
| Employment | 23 | 0 | 0 | 0 | yes | yes |

In every page, the body's computed `font-family` starts with `"JetBrains Mono"`.

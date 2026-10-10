# Builds v2 (`Builds v2.dc.html`) — what changed

Comparison basis: `Builds.dc.html` (old) vs `Builds v2.dc.html` (new). Same six-pane
TUI vocabulary, same palette and JetBrains Mono type; the changes are craft, density
and pane chrome.

## Structure
- **Pane count 6 → 5.** `[5] Command Log` was removed; its GitHub link now lives in the
  Commits pane footer.
- **Status pane has no border.** It reads as a bare header strip instead of a framed pane,
  and its header badge was dropped entirely.
- **Right column weights changed.** Content sizes to its own content (`flex:none`) and
  Commits takes the remaining space, so no pane clips mid-block.
- Both columns gained `min-height:0` so long lists shrink instead of pushing the tmux
  status bar off-screen.

## Pane headers
- Spider-glyph pill badge → **pixel frame badge**: square corners, layered
  `box-shadow` frame (1px inner rule, 3px dark step, 4px red-tinted outer step), a solid
  red index block (`1`, `2`, `3`, `4`) and a letter-spaced uppercase label.
- No glyph artwork in the badge at all (the spider `<img>` and an interim pixel-diamond
  motif were both removed).
- **No focused pane.** The old red 1px border + red glow on Repositories is gone; every
  pane now uses the same `rgba(224,69,60,.3)` hairline.

## Selection
- Selected rows use **solid fills** (`rgba(224,69,60,.22)` repo, `rgba(74,159,224,.16)`
  tree, `rgba(224,69,60,.2)` HEAD commit) instead of left-to-right gradients.
- The 2px coloured left edge line was removed; the gutter stays transparent so row text
  keeps its alignment.

## Pane-by-pane
**[0] Status** — added month ticks (SEP…AUG) above the contribution grid and a
`less ▪▪▪▪▪ more` legend; contribution cells 6px → 5px; added a secondary stat line
(`1,204 commits / yr · streak 6d`); `main` became a bordered chip.

**[1] Repositories** — rows are a real column grid (`10px | name | lang | age`) so
language tags and ages align; meaningless blue dots replaced by colour-coded language
chips (`js` gold, `py` blue, `dir` gold-dim); caption carries `8 local · recent first`
and a `/ filter` hint; footer has `↵ open` plus a **GitHub mark button** (official
simple-icons mark, recoloured, links to the selected repo).

**[2] Files** — file-type SVG icons replaced by box-drawing tree guides
(`│ ├─ └─`) and coloured extension suffixes (`.js`, `.html`, `.json`, `.md`); caption
shows the repo name + file count; README.md sits above `index.html` / `package.json`
so the selected file is never the clipped bottom row; footer shows `↹ expand · +26 more`.

**[3] Content** — raw markdown lines replaced by a designed README block: 15px red title,
one-line summary, teal-bordered stack chips (`JavaScript / Three.js / Vite`), a
letter-spaced `HOW TO PLAY` label with a single instruction line; caption shows the
breadcrumb path, a `● playable` status and `md · 21 lines`; footer `o open on github ·
p play build · utf-8 · lf`.

**[4] Commits** — rows are a fixed grid (`hash | author | subject | tag | age`) aligned to
a 21px row rhythm that the graph SVG matches exactly; 7 rows → 3 with the graph path
trimmed to suit; `HEAD main` / `tag v1.0` chips downsized; footer `d diff · +78 earlier ·
github.com/shevinum`.

## Chrome / polish
- Every truncated list fades at its cut edge (`mask-image`) rather than slicing a row.
- Glow and inset-shadow noise reduced across all panes and badges.
- Consistent 19px top padding on framed panes so no caption sits under a badge.
- `html,body{height:100%;overflow:hidden}` added so the layout can never scroll.

## Tweaks (props)
Was: `scanlines`, `wallBlurPx`, `scrimOpacity`.
Now also: `showWall` (radar-wall background on/off), `showContrib` (contribution graph
on/off).

## Animations
Unchanged from the original: one `pls` keyframe (opacity .45↔1), used by the
`connected` dot in Status (2.4s). The Repositories "dirty" pulse was dropped with the
old footer indicator.

# Employment v2 (`Employment v2.dc.html`) — what changed

Comparison basis: `Employment.dc.html` (old) vs `Employment v2.dc.html` (new). The
layout (file browser left · neon service timeline centre · preview right), the record
data, the keyboard model (`j`/`k`/`g`/`G`), the corner spider sigils and the tmux status
bar are all unchanged.

## Pane headers
- Both pill badges → **pixel frame badges matching Builds v2**: square corners, layered
  `box-shadow` frame (1px inner rule, 3px dark step, 4px red-tinted outer step), solid red
  index block, letter-spaced uppercase label.
- `Employment ✳ Records` → `1 EMPLOYMENT RECORDS`; `File ✳ Preview` → `2 FILE PREVIEW`.
- The spider-glyph `<img>` inside each badge was removed (the corner sigils still use the
  glyph assets).

## Panel 1 — Employment Records
- **No focused-pane treatment.** The red 1px border + 30px red glow became the same
  `rgba(224,69,60,.3)` hairline used by the preview pane.
- Selected row highlight: left-to-right gradient → **solid** `rgba(224,69,60,.26)`.
- The 2px red left edge line on the selected row was removed (gutter kept transparent, so
  row text does not shift).

## Panel 2 — File Preview
Was a numbered source view: a gutter of line numbers with two-tone syntax colouring of
raw markdown (`role: "…"`, `# Heading`, backticked tag string, `## Summary`, `- bullet`).

Now a **rendered markdown preview**:
- Line-number gutter removed.
- **Frontmatter block** — `role:` / `dates:` / `loc:` in a blue-tinted box with a 1px
  inner rule, teal keys and gold values.
- **H1** — 15px bold red role title, with a dim `org · location · dates` meta line.
- **Code chips** — the backticked stack string is parsed into individual teal-bordered
  chips (`python`, `typescript`, `fastify`, …).
- **H2** — section name rendered as a letter-spaced red label (`SUMMARY` / `HIGHLIGHTS`).
- **List** — square red bullet markers with wrapping body text, 3 bullets shown, plus the
  `… N more · o opens the file` truncation note.
- **Bottom-aligned** — the body uses `justify-content:flex-end` so the markdown sits flush
  with the pane's bottom edge (mirroring the record list opposite), with the fade band
  moved to the top edge.
- Caption row (`.rw-r--r-- · shev · size · path · lines`) is unchanged.

## Logic
- `buildLines(record)` (flat coloured line objects) replaced by `preview(record)`, which
  returns `frontmatter`, `title`, `meta`, `tags`, `sectionLabel`, `bullets` and
  `moreNote`; `renderVals()` spreads it.
- `lineCount` still reports `7 + min(3, bullets)` to match what the preview shows.

## Unchanged
Timeline nodes, spinning rings, spark animation along the spine, marker dashes, the
`RECORDS` dataset, props (`scanlines`, `cornerSigils`, `timelineAccent`, `wallBlurPx`,
`scrimOpacity`) and all keyframes (`pls`, `spin`, `rspin`, `blink`, `spark`, `dash`,
`webglow`).

## Known nit (pre-existing, inherited)
The selected node's dashed marker line passes through the year label, so e.g. `May 2024`
can read as struck through. Not introduced by v2 — say the word and I'll offset the label.

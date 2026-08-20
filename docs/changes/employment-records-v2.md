# Employment Records v2 — change log

Rebuild of the Employment Records window (`2:employment`), replacing the old
hierarchical drill-down file browser with the flat list + service timeline
design from `UI-Mockups/builds-page-design-review/Personnel.dc.html` /
`Personnel-Panel-Changes.md`. Old component: `src/components/employment-records/
EmploymentRecords.svelte` (734 lines, single file). New: same folder, split
into an orchestrator (`EmploymentRecords.svelte`), a reactive core
(`employmentRecordsState.svelte.ts`), and three panel children
(`RecordsPanel.svelte`, `TimelinePanel.svelte`, `PreviewPanel.svelte`) — the
folder+state-class pattern established by `src/components/repositories/` and
`src/components/notifications/` (PLAN.md Decision 12: this is a from-scratch
rebuild directly in that pattern, not a relocation of the old drill-down
state machine, since E1-E3 delete that state machine entirely).

## Structural change (predates this rebuild's own scope, called out for
completeness — see `Personnel-Panel-Changes.md` item 8)

The old browser was a real hierarchical drill-down: `../`, folder rows
(`enaimco/`, `memorial-university/`), then role rows or further
subdirectories (`enaimco/software-developer/{role.md, full-time/, part-time/,
co-op/}`), an `f` filter mode, and a bottom `n / total` position counter. The
new page is a flat, single-level list — no folders, no filter, no `../`.

## Interpretation: which collection entries count as one record

The `personnel` collection is a variable-depth tree (see
`content.config.ts`'s own header comment): `<org>/<role-slug>/role.md` for
every position (9 leaf `role.md` files today), and the Enaimco Software
Developer position additionally has three deeper sub-role leaves
(`full-time/`, `part-time/`, `co-op/`, each `<org>/<role-slug>/<sub>/role.md`)
recording finer-grained employment-type changes within that one position.

The mockup's mock `RECORDS` array has exactly six entries, one per
`<org>/<role-slug>` position, and its Enaimco entry ("May 2024 – Present /
28mo") is the position's own base `role.md`, not a stale pre-split snapshot —
its numbers match the real base `role.md`'s frontmatter under the visual
suite's frozen clock (`CLOCK_TIME = 2026-08-15T23:34:00`) exactly. This
rebuild reads the flat list as **one record per `<org>/<role-slug>`
directory** (`dirSegmentsOf(entry).length === 2`), which:

- Reproduces the mockup's six-record list and its derived index-block values
  exactly against the real collection (verified below).
- Avoids the two failure modes of flattening all 9 leaves instead: the base
  `role.md` would overlap its own three sub-role date ranges (duplicate,
  overlapping timeline entries for one real position), and the sub-role
  leaves have no standalone display name (every leaf on disk is literally
  named `role.md` — see `content.config.ts`'s comment — so a synthetic name
  for `full-time/role.md` alone, e.g. `"full-time.md"`, reads as meaningless
  outside its parent role's context).

**Consequence, flagged for the orchestrator/user rather than hidden:** the
three Enaimco sub-role documents (`full-time/role.md`, `part-time/role.md`,
`co-op/role.md`) are no longer reachable from this page — there is no
drill-down left to descend into them. They remain on disk and in the
collection; only this page's flat view omits them. If per-employment-type
detail should surface somewhere, that's new scope for a future round, not
part of this rebuild.

## Diff (grouped, mirrors Personnel-Panel-Changes.md's structure)

1. **Renamed** "Personnel Files" → "Employment Records" (already done in
   Phase C; unchanged here).
2. **Badge repositioned + restyled**: the old flat text label
   (`─ Employment Records ─`, centered on the LEFT panel's BOTTOM border) is
   now a bordered pill (`PanelBadge.svelte`, blue/red variant) straddling
   the TOP border of both panels, split-text style (`Employment <glyph>
   Records` / `File <glyph> Preview`) — a new mode added to `PanelBadge`
   (`left`/`right` props) alongside its existing `{n} · {label}` mode used by
   Repositories' six numbered panels.
3. **Removed**: the `f`-filter prompt row/mode and its `blk` cursor
   animation, the bottom hint bar, the `../` up-row, and the entire
   depth-generic tree-walking reactive core (`buildTree`/`findOrCreateDir`/
   `computeDirOrders`/`sortChildren`/`leavesOf` and friends).
4. **Panel width**: left and right panels are now equal (`flex:1;min-width:0`
   each), with a new 188px timeline column between them.
5. **Index block added**: `── index ──` rule + `orgs` / `longest` / `years
   active`, all derived from the real collection (see below), sitting above
   the breadcrumb, directly under the badge.
6. **Timeline added**: a vertical service-history spine hanging off a
   spiderweb glyph, one numbered node per record (oldest = 1), synced to the
   row-list selection.
7. **Embedded editor removed**: the old component opened the shared vim
   `Editor.svelte` on Enter (`enaimco/software-developer/role.md` etc. were
   fully editable buffers). The new page has no drill-down and the preview
   panel already tracks the selection live, so Enter is now a harmless,
   consumed no-op (Decision 7) — `isEditorOpen()`/`runEditorExCommand()` stay
   exported for `Terminal.svelte`'s `bind:this` API parity but are trivial
   (`false` / `{recognized:false}`).
8. **Row/file naming**: every real leaf on disk is literally named `role.md`
   (`content.config.ts`), so the flat list's display name is synthesized
   from the role's own directory slug instead (`software-developer.md`,
   `computer-science-tutor.md`, `design-and-development-assistant.md`, …) —
   the mockup's mock data used similar but not identical slugs (e.g.
   `design-and-development.md`); the real directory slugs are used verbatim
   here rather than copying the mockup's invented filenames.
9. **Row sizes**: the byte size column and the preview header's file size
   are computed from the real `role.md` body's UTF-8 byte length
   (`personnel` entry's `entry.body`), never copied from the mockup's mock
   `size` numbers.
10. **Corner sigils**: kept (Decision 10) — the mockup's `cornerSigils`
    data-prop defaults to `true`, so all four corner glyphs
    (`spider-glyph-{red,blue,teal,gold}.svg`) render on the whole
    three-column cluster, exactly as authored.
11. **Meta line skipped**: the mockup's `sort mtime desc · filter *.md ·
    hidden 0` line under the breadcrumb is mock-editor decoration — this
    page's actual sort is "newest start date first, `order` ascending on a
    tie" (parsed frontmatter dates), not directory mtime, and there is no
    file-extension filter or hidden-file concept left to describe truthfully,
    so the line is omitted rather than left as a lie.
12. **`personnel.yaml` pruned**: `pathPrefix`, `insetTitles`, `promptIcon`,
    `hints`, `upEntry`, `companyRowIcon`, `roleRowIcon`, `roleCountTemplate`,
    `roleWordSingular`/`roleWordPlural`, `posTemplate`, and the entire
    `editor:` block (dead now that no editor is embedded on this page) are
    all gone, replaced by `breadcrumb`, `orgTags`, `index`, `fileOwner`,
    `filePerms`, `badge`, and `previewLineCountTemplate`.

## Index block derivation (real values, `src/content/personnel/*/*/role.md`)

At the visual suite's frozen "now" (`2026-08-15T23:34:00`, matching the six
records' own mockup durations exactly):

| Stat | Value | Source |
|---|---|---|
| `orgs` | 2 | distinct top-level directory segments among the six org/role records (`enaimco`, `memorial-university`) |
| `longest` | 36 mo | `max(months)` across the six records — Memorial's Software Developer, Sep 2023 – Present |
| `years active` | 2022 – 2026 | `min(startYear)` .. `max(endYear)` across the six records (Communications Assistant's Oct 2022 start; the four still-`Present` records' end year resolves against "now") |

Month count formula: `(endYear - startYear) * 12 + (endMonth - startMonth) +
1` (inclusive), "Present" resolved against the current `Date` read at
component-mount time in the browser — this is what lets Playwright's
`page.clock.install`/`CLOCK_TIME` freeze it for goldens the same way it
freezes the status-bar clock, rather than baking a real build-time date into
the static HTML.

Org tags (`ena`/`mun`) are not mechanically derivable from the directory
slugs (`memorial-university` is not `mun` by any truncation rule) — hand
authored in `personnel.yaml`'s new `orgTags` map.

## Animation inventory

**Before** (old component, per `Personnel-Panel-Changes.md`): exactly one —
`blk`, the `f`-filter prompt's blinking text cursor (`1.1s steps(1)
infinite`), gone along with the filter bar.

**After** (new timeline column, `TimelinePanel.svelte`):

| Keyframe | Timing | Where |
|---|---|---|
| `spin` | 9s (selected) / 24s (idle), linear infinite | dashed outer ring per node |
| `rspin` | 14s linear infinite (constant) | solid inner ring per node |
| `spark` | 4.6s linear infinite | bright streak traveling down the spine |
| `dash` | 0.9s linear infinite (one side `reverse`) | marching-ants connector lines flanking the selected node |

Plus continuous CSS *transitions* (not keyframe animations — fire only on a
selection change, so they never affect a fixture/golden capture mid-shot):
marker glow + both connector lines' `top` (0.45s `cubic-bezier(.2,.75,.2,1)`),
each node's ring `width`/`height` (0.4s), each node's center dot
`width`/`height`/`background`/`color` (0.3-0.4s), each node's year/duration
label `color` (0.3s).

The mockup's other three declared keyframes — `pls`, `blink`, `webglow` —
are dead in the source file itself (per `Personnel-Panel-Changes.md`'s own
animation inventory) and are not ported.

All four live keyframe animations are disabled (`animation:none`) under
`fixtureMode`, the same `state.fixtureMode` ternary convention
`src/components/repositories/StatusPanel.svelte`/`ReposPanel.svelte` and
`src/components/notifications/NotificationBell.svelte`/
`NotificationsPanel.svelte` already use for their own infinite `pls`
animations.

## Spiderweb / spine color check

`public/assets/spider-web-red.svg`'s path fill is `#e0453c` (verified by
reading the file directly) — identical to the spine's
`rgba(224,69,60,.55)` base color. Applying the mockup's literal
`opacity:.55` to the `<img>` therefore reproduces `rgba(224,69,60,.55)`
exactly with no filter/recolor needed; the spine (`top:56px`) starts at the
web's own visual center (`top:2px` + roughly half its 108px intrinsic
height ≈ 56px), so the two read as one continuous element.

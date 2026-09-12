# Phase 08 — employment

> **Status: closed 2026-09-12** — executor → verifier PASS + auditor clean, after one fix round (7 stale-path citations) and two orchestrator D23 rulings. Predecessor phase 07 closed 2026-09-12. Binding decisions: `Instructions/00-phases.md` (the only cross-phase document this plan may read). This plan is self-contained: every mechanism it needs is stated here verbatim, so the executor never reads another phase's folder.

## Context

**`src/features/employment`.** Everything below is scoped to it except the declared out-of-context wiring.

**This is the highest-fallout feature phase so far.** Not because the component move is hard — it is five files and mechanically the same as phase 06 — but because employment's *content tree* is read from disk by three files in **other** contexts, none of which the original stub mentioned. Two of them fail loudly (`ENOENT` / a hand-audited whitelist mismatch) and one fails as a wrong assertion. §Background's "Out-of-context literal-path breaks" table is the part of this plan that earns its length. **Read it before step 1.**

**Declared out-of-context wiring** (mechanical only — D24's closing clause; no behavioral edits outside the context, ever):

| file | why |
|---|---|
| `playwright.config.ts` | three project entries (§Mechanics 3) |
| `package.json` | `test:e2e` / `test:visual` explicit lists |
| `src/content.config.ts` | the `personnel` collection's `base:` ternary — **both** branches (D22) |
| `src/common/lib/data.ts` | `personnel.yaml` `?raw` import re-point (D17) |
| `src/common/components/PaneTree.svelte` | import path for `EmploymentRecords.svelte` (ruling R5) |
| `src/pages/harness/[feature].astro` | one `employment` branch (D24) |
| `tests/visual/identical.spec.ts` | `SPLIT_OWNED_RECIPE_NAMES` gains `04-employment-l0` and `05-employment-l1` |
| `common/tests/unit/views.test.ts` | `expectedView()`'s hardcoded path whitelist (**break #1** — see §Background) |
| `common/tests/unit/docline.fixtures.json` | three real-fs `"path"` values (**break #2**) |
| `tests/e2e/grep.spec.ts` | one literal real-index path assertion (**break #3**) |
| `src/lib/fileIcons.ts` → `src/common/lib/file-icons.ts` | D16 promotion (ruling R1) |
| `src/components/grep-overlay/grepOverlayState.svelte.ts`, `src/components/repositories/FilesPanel.svelte` | `fileIcons` import paths, path-only (R1) |
| `docs/testing/{e2e,visual}/running-tests.md` | project rows (doc-practice, same commit) |
| `tests/visual/goldens/<vp>/{04-employment-l0,05-employment-l1}.png` | deleted after the copies are verified |

**Explicitly NOT touched by this phase** — verified, not assumed. If you believe one needs editing, stop and report:

- `package.json`'s `build:fixtures` — **no `cp` clause for personnel exists or is needed** (ruling R4).
- `src/pages/employment.astro` — verified thin: it imports only `getPersonnel`/`getCollection("personnel")` from `common/lib/data` and `astro:content`, neither of which changes shape. **Zero edits.**
- `src/common/components/editor/` — the editor is common's (D9). Employment consumes it; this phase does not touch it.
- `src/components/repositories/PreviewPanel.svelte` — a **different file** with the same basename (ruling R6).
- `tests/visual/adversarial-fixtures.spec.ts` — stays in the legacy tree untouched (ruling R2).
- `scripts/generate.mjs` — walks `src`/`tests`/`scripts`; `src/features/employment/…` stays under `src/`, so no path constant changes.
- `vitest.config.ts` — already globs `src/features/*/tests/unit/**`. Employment owns no unit test anyway (R7).
- `common/tests/ui/e2e/cmdline.spec.ts` and `tests/ui/smoke/smoke.spec.ts` — both couple to employment's **route and testids** behaviourally (navigate `/employment`, expect `employment-row`, press Enter, expect `editor-scroller`), not to any file path. Those couplings survive the move untouched, and D20(a) gates them. **Do not "fix" them** — if either goes red, the move is wrong, and that is exactly the signal they exist to give.

## Objective

The employment records feature — records/timeline/preview panels and its state class — lives in `src/features/employment/`, moved verbatim, with both e2e specs and the `04-employment-l0`/`05-employment-l1` goldens green at both viewports and zero golden churn; the personnel content and fixture trees move with their on-disk shape intact; `fileIcons.ts` is promoted to common per D16; and an `employment-harness` route mounts `EmploymentRecords` with no Terminal kernel.

## Background — verified inventory

Every path below was verified on disk. **Do not re-derive; do verify before editing** — line numbers in particular may have shifted by a line or two since this inventory was taken (phase 07 edited `data.ts` and `PaneTree.svelte`). Grep for the symbol, do not trust the number.

### Move table

| from | to | lines |
|---|---|---|
| `src/components/employment-records/EmploymentRecords.svelte` | `src/features/employment/components/EmploymentRecords.svelte` | 95 |
| `src/components/employment-records/RecordsPanel.svelte` | `…/components/RecordsPanel.svelte` | 87 |
| `src/components/employment-records/TimelinePanel.svelte` | `…/components/TimelinePanel.svelte` | 169 |
| `src/components/employment-records/PreviewPanel.svelte` | `…/components/PreviewPanel.svelte` | 50 |
| `src/components/employment-records/employmentRecordsState.svelte.ts` | `…/components/employmentRecordsState.svelte.ts` (D15: state classes keep `<name>State.svelte.ts`) | 285 |
| `src/content/personnel/` (9 `.md`, variable depth) | `src/features/employment/content/personnel/` | 9 files |
| `fixtures/personnel/` (9 `.md`, variable depth) | `src/features/employment/tests/ui/support/personnel/` | 9 files |
| `src/data/personnel.yaml` | `src/features/employment/content/personnel.yaml` (D17) | 67 |
| `tests/e2e/employment.spec.ts` | `src/features/employment/tests/ui/e2e/employment.spec.ts` | 356 |
| `tests/e2e/employment-layout.spec.ts` | `…/tests/ui/e2e/employment-layout.spec.ts` | 184 |
| `tests/visual/goldens/<vp>/04-employment-l0.png` | `src/features/employment/tests/ui/visual/goldens/<vp>/` | 2 files |
| `tests/visual/goldens/<vp>/05-employment-l1.png` | `…/tests/ui/visual/goldens/<vp>/` | 2 files |

`src/components/employment-records/` holds exactly those five files and nothing else — verified; the directory is deleted when empty.

### Out-of-context literal-path breaks — the part that bites

These three files read employment's content tree **from disk by literal path**. They import nothing from employment, so an import-only sweep misses all three. Each must be fixed **in the same change** as the move that invalidates it (D8), and each is declared out-of-context wiring:

**Break #1 — `common/tests/unit/views.test.ts` (fails as a whitelist mismatch).** Its `expectedView()` hand-audits *every path in the real generated `public/generated/grep-index.json`* against hardcoded prefixes:
```ts
if (path.startsWith("src/content/personnel/")) return "employment";
if (path === "src/components/employment-records/EmploymentRecords.svelte") return "employment";
```
After the move + `pnpm generate`, the real index carries `src/features/employment/content/personnel/…` and `src/features/employment/components/EmploymentRecords.svelte`. `grepPathToView()` itself still classifies both correctly — it matches on segment/filename (`(^|\/)content\/personnel\/`, `(^|\/)EmploymentRecords\.svelte$`), not on a `src/`-anchored prefix — but `expectedView()`'s literals will not match, producing a mismatch that **fails two tests**. Update both literals. Lines further down the same file feed old-style literals directly into `grepPathToView()`; those still pass (the regex is depth-agnostic) but no longer name a real on-disk path — refresh them for truthfulness in the same change. The `routed.length >= 8` assertion is unaffected: the count does not change, only the strings.

**Break #2 — `common/tests/unit/docline.fixtures.json` (fails as `ENOENT`).** Three `"path"` values point at real files under `src/content/personnel/enaimco/software-developer/{full-time,part-time,co-op}/role.md`, and `common/tests/unit/docline.test.ts` does a **real `readFileSync`** on each. The moment the content tree moves these throw. **This is the single most easily-missed break in the phase** — it is a `.json` fixture, so it matches no `.ts`/`.svelte` grep.

**Break #3 — `tests/e2e/grep.spec.ts` (fails as a wrong assertion).** It asserts a row's `data-path` equals the literal `"src/content/personnel/enaimco/software-developer/co-op/role.md"`, which the real grep index will no longer contain. `grep.spec.ts` belongs to phase 10's not-yet-migrated context; D8 and D24's mechanical-edit clause sanction updating it here — **the literal only**, nothing else in that file.

After step 3, run this to prove none of the three were missed:
```bash
grep -rn "content/personnel\|employment-records" src common tests scripts docs | grep -v "^src/features/employment"
```
Every surviving hit must be an intentionally-updated line.

### Orchestrator rulings (do not re-litigate — architecture R003)

- **R1 — `src/lib/fileIcons.ts` is promoted to `src/common/lib/file-icons.ts` (D15 kebab-case). This is not deferred.** D16 sets the bar at "≥2 verified real consumers (grep before promoting)"; the grep was run and found **three**: `src/components/employment-records/employmentRecordsState.svelte.ts` (this phase), `src/components/repositories/FilesPanel.svelte` (phase 09), `src/components/grep-overlay/grepOverlayState.svelte.ts` (phase 10). The bar is met and exceeded, so D16 mandates promotion. The alternative — leaving it and having `src/features/employment/` import `../../../lib/fileIcons` — would author a **feature → transient-legacy-tree** edge, strictly worse than the three legacy→common edges promotion produces (legacy→common is the direction the whole migration moves in, and it needs no further change when 09 and 10 migrate — their imports are already correct). Contrast phase 06's `agoLabel` ruling, which declined promotion because that was a *function inside* a 431-line module being moved verbatim; this is a whole 21-line module with its own clean surface, exactly what D16 is about. **Mechanics:** the file imports `../generated/file-icons.json`; that relative path changes at the new home — verify it, do not guess. `src/generated/file-icons.json` itself is a generated artifact and **does not move**. Update all three consumer imports, path-only. The promotion is **its own commit** (R012), separate from the employment move.
- **R2 — `tests/visual/adversarial-fixtures.spec.ts` stays in the legacy tree, untouched.** It carries an employment `describe` block and a repositories `describe` block in one file, wired into `test:visual` by path rather than through a Playwright project. It has **no literal-path dependency** on `src/content/personnel` or `src/components/employment-records` — only testid and route couplings, all of which survive the move unchanged — so it needs no edit to stay green. Splitting a file whose other half belongs to a context that has not migrated yet would either move repositories' assertions prematurely or leave a half-file behind. **Phase 09 decides its disposition** once both halves' contexts exist. Its continued green-ness is a real regression gate for this phase; if it goes red, the move is wrong.
- **R3 — the harness needs a wrapper, and it is worth it.** `EmploymentRecords.svelte` exports `handleKey()` but attaches no listener of its own; in the real app `Terminal.svelte`'s generic per-pane-ref delegation (`if (ref.handleKey(e)) return`) routes keydowns to it via `PaneTree`'s shared `refs` map. Employment's two most distinctive interactions — `j`/`k` cursor movement and `Enter` opening the editor — are keyboard-only and therefore unreachable from a direct mount. Build `src/features/employment/tests/ui/harness/EmploymentHarness.svelte` reproducing **only** that keydown→`handleKey()` routing, exactly as `NotificationsHarness.svelte` and `HelpHarness.svelte` already do, and document the divergence in its header comment. Row *selection* is click-driven (`onclick={() => state.select(i)}` in both `RecordsPanel.svelte` and `TimelinePanel.svelte`) and needs no wrapper support. Accept the dead ~1 KB `EmploymentHarness.<hash>.js` chunk in the real build — pre-ruled harmless (`00-phases.md`, Deferred); phases 05–11 may ship it without a new ruling.
- **R4 — the fixture switch is a `content.config.ts`-only change; `build:fixtures` gains nothing.** Unlike `grep-index.json` / `fs-index.json` / `contributions.json` (static JSON assets fetched client-side, each with its own `cp` clause), the personnel collection is consumed at **Astro build time** through the content-collection loader, so there is nothing to copy into `dist/`. D22's "copy sources" clause simply does not apply. **Both** branches of the ternary update:
  - `useFixtures ? "fixtures/personnel"` → `"src/features/employment/tests/ui/support/personnel"`
  - `: "src/content/personnel"` → `"src/features/employment/content/personnel"`
  Both are gated by the D20(b) fixture-build invocation — a green real build proves only half of this.
- **R5 — `PaneTree.svelte` → `EmploymentRecords.svelte` is a path-only update, recorded as D23(c).** Same class as the `PaneTree.svelte`→`Profile.svelte` edge D23(c) already names verbatim and the `PaneTree.svelte`→`Dashboard.svelte` edge phase 07 recorded. Direction pre-existed the move. **No re-export shim, no stub, no injection registry** — that registry is a Deferred hardening item.
- **R6 — `06-editor` is NOT employment's golden; do not re-move it.** The recipe reaches the editor via `Ctrl-b 2 Enter` (the employment window is merely its entry point), but its golden already lives at `common/tests/ui/visual/goldens/<vp>/`, moved there by phase 02 under D9, and `06-editor` is already in `SPLIT_OWNED_RECIPE_NAMES`. Employment owns exactly two goldens: `04-employment-l0` and `05-employment-l1`. Verified: `find tests/visual/goldens -iname "*employment*"` returns only those two names × two viewports.
- **R7 — employment owns no unit test, and none is written.** Verified: no `*employment*`/`*personnel*` test exists anywhere under `tests/unit/`. `vim.test.ts` moved to common in phase 02 (D9). Do not backfill — that is decided per phase on size (00-phases.md, D23 closing note) and nothing here is a small additive gap.
- **R8 — `employmentRecordsState.svelte.ts` is covered by D23(e) in advance.** 00-phases.md's phase-06 ruling generalized (e) from a file list to a rule: **any `<name>State.svelte.ts` relocated verbatim** is exempt from classes.md's encapsulation and ordering rules (`private` rather than `#` fields, public mutable `$state` written by sibling components, mid-file field declarations). Expect the auditor to raise these and expect them to be exempt. **Do not "fix" them** — that is the rewrite the move-don't-rewrite stop conditions forbid. Code *authored* this phase is never covered.

### Other verified facts

- **The personnel tree's on-disk case and depth are load-bearing.** `src/content.config.ts`'s `personnel` collection uses a custom `generateId: ({ entry }) => entry.replace(/\.md$/, "")` that preserves the relative path verbatim as the entry id, and `employmentRecordsState.svelte.ts` derives org/role grouping from that id. The real tree is 9 files at depth 2–3 under its base (`enaimco/software-developer/role.md`, plus `co-op/`, `full-time/`, `part-time/` sub-roles; five `memorial-university/*/role.md`); the fixture tree mirrors the shape with different names (`damage-control/*`, `oscorp/research-technician/` + three sub-roles). `personnel.yaml`'s `orgTags` keys are lowercase and must keep matching the directory names. **Move whole parent directories with `git mv`; never rename a leaf.** No case-only rename is involved anywhere, so macOS's case-insensitive filesystem poses no collision risk here — verified, no pair in either tree differs only by case.
- Both trees contain untracked, gitignored `.DS_Store` files. They are not part of the move and `git mv` will not carry them. Confirm the destination has none afterwards.
- **The editor import is in `EmploymentRecords.svelte`, not `PreviewPanel.svelte`** (the stub said otherwise). `EmploymentRecords.svelte` imports `Editor` from `../../common/components/editor/Editor.svelte`; employment's `PreviewPanel.svelte` imports only `PanelBadge` and the state type. Feature→common is allowed (architecture R004).
- **Employment imports nothing from `features/*` or from `src/components/repositories/`** — verified exhaustively across all five files. Its only non-common legacy import is `../../lib/fileIcons`, which R1 resolves.
- Both specs import the **shared fixture** (`common/tests/ui/support/fixtures.ts`), not raw `@playwright/test` — unlike notifications' 2-raw/1-shared split, there is no mixed convention to preserve here. Both currently carry an explicit `.ts` extension that the port step must strip (D23(d)).
- Both specs define `ROOT = join(import.meta.dirname, "../..")` and `PERSONNEL_DIR = join(ROOT, "src/content/personnel")`, and walk it with real `readdirSync`/`readFileSync`. `employment-layout.spec.ts` additionally reads `src/data/personnel.yaml` directly, bypassing `data.ts`. **All of these re-depth and re-path** — D8, mandatory, same change.
- **Post-phase-07 shared state** (this is what you are appending to): `SPLIT_OWNED_RECIPE_NAMES` currently holds 12 entries and gains two more. `test:e2e`'s project list currently ends `--project=dashboard-1512x945 --project=dashboard-1920x1080`. `test:visual`'s path list currently ends with dashboard's `identical.spec.ts` and `harness/dashboard.spec.ts`. Goldens are distributed root 18 / common 10 / features 14 = 42; after this phase, root drops to **7 recipes / 14 PNGs** and employment gains **2 recipes / 4 PNGs**, total still 42. `src/pages/harness/[feature].astro` currently has `profile`, `help`, `boot`, `notifications` and `dashboard` branches.
- **Unit baseline: 346 passed / 20 files.** This phase moves no unit test, so the count must be **unchanged** — but breaks #1 and #2 live in unit tests, so a red `test:unit` here means a missed literal path, not a flaky suite.
- **v1 drift:** `TimelinePanel.svelte`, `personnel.yaml`, `fixtures/personnel/` and all four goldens are **byte-identical** to v1. The other four components and both specs **differ only by path rewrites** already applied in earlier phases. `src/content/personnel/` is identical except the untracked `.DS_Store`s. **Nothing is genuinely diverged.**

### Stale-comment debt (fix in the same change as the move that invalidates it)

- `tests/e2e/employment-layout.spec.ts:9-10` — claims `fixtures/personnel` "deliberately does not exist" and cites `content.config.ts`'s header. **This is factually wrong today**: `fixtures/personnel/` verifiably exists with 9 files and the collection *is* fixture-switched. The comment predates the switch. Correct it to describe what the code actually does (comments.md R003).
- `tests/e2e/employment.spec.ts` — a comment cites `tests/e2e/editor-vim.spec.ts`; that file moved to `common/tests/ui/e2e/editor-vim.spec.ts` in phase 02. Repoint.
- Employment's components and `personnel.yaml` carry v1 process citations — see step 7's sweep, which is where they are fixed.

## Mechanics (settled by phases 02–07; reuse verbatim, do not redesign — architecture R003)

**1. D21(a) snapshot paths.** The root `snapshotPathTemplate` stays `"tests/visual/goldens/{projectName}/{arg}{ext}"`. Every split visual project carries its **own** template with the viewport as a **literal**, never `{projectName}`.

**2. Project naming.** A Playwright project is 1:1 with one `use` config, so each tier emits **two** entries via `viewports.map(...)`. **There is no bare alias and no glob** — `--project=employment` and `--project="*-visual"` both error. Always the two explicit flags.

**3. The three project entries this phase adds** to `playwright.config.ts`, appended after the `dashboard-harness` entry:

```ts
...viewports.map((viewport) => ({
  name: `employment-${viewport.name}`,
  testDir: "./src/features/employment/tests/ui/e2e",
  use: { ...devices["Desktop Chrome"], viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 },
})),
...viewports.map((viewport) => ({
  name: `employment-visual-${viewport.name}`,
  testDir: "./src/features/employment/tests/ui/visual",
  snapshotPathTemplate: `src/features/employment/tests/ui/visual/goldens/${viewport.name}/{arg}{ext}`,
  use: { ...devices["Desktop Chrome"], viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 },
})),
{
  name: "employment-harness",
  testDir: "./src/features/employment/tests/ui/harness",
  use: { ...devices["Desktop Chrome"], viewport: { width: viewports[0].width, height: viewports[0].height }, deviceScaleFactor: 1 },
},
```

**4. D24 harness route.** `src/pages/harness/[feature].astro` is one shared dynamic route gated by `if (process.env.PORTFOLIO_FIXTURES !== "1") return [];` in `getStaticPaths`. Add an `employment` entry to (a) the `getStaticPaths` array, (b) a `const employment = feature === "employment" ? … : undefined` line assembling the same props the real page does (`getPersonnel()` + `getCollection("personnel")`), and (c) a conditional block in the template mounting `EmploymentHarness` (R3). The collection fixture-switches itself under `PORTFOLIO_FIXTURES=1`, so the harness needs no special fixture handling — it gets the fixture tree automatically.

**5. Harness hydration race — required.** Whenever the harness ships `client:load`, the server-rendered HTML exists before hydration, so a spec that waits on a content locator races the listener attaching. Render an `onMount`-flipped element and wait on **that**:

```svelte
<div data-testid="employment-harness-ready" data-ready={ready}></div>
```

**5b. Harness assertions are web-first — do not copy the ported specs' reads.** Phase 05 lost a fix round to this. A verbatim-ported spec may read values non-retryingly (`textContent()`, `page.evaluate()`) because it races a *live* clock. A harness spec does not inherit that justification: its state is static, so there is no race to guard against. Assert through the page object with `await expect(pageObject.x).toHaveText(...)` / `.toHaveAttribute(...)`. **`playwright.md` R002 bans CSS selectors unconditionally — that includes `document.querySelector` inside `page.evaluate()`**, the exact shape phase 05 got wrong. The one sanctioned non-retrying read is deriving an *expected value* to feed a web-first assertion — never as the assertion itself.

**6. Page objects.** `src/features/employment/tests/ui/pages/EmploymentPage.ts`, a sibling of `e2e/`/`visual/`/`harness/`. A feature page object **may not** redefine kernel-chrome locators — compose the shared class:

```ts
import { StatusBarPage } from "../../../../../../common/tests/ui/pages/StatusBarPage";
```

Verify that relative depth with `node -e "…path.relative…"`; do not guess it.

**7. Locators.** `playwright.md` R002 bans CSS selectors unconditionally, even scoped off a resolved testid. If a repeated element needs narrowing, add a real `data-testid` to the markup (attribute-only, zero pixel change, goldens re-verified in the same change — D24's sanctioned mechanical edit). Any testid **authored** in this phase must carry the `employment-` prefix (files-and-naming R014); *ported* markup's testids are exempt under D23(e).

**8. Per-commit index self-consistency (toolchain R012).** If this phase's edits span multiple commits, run `pnpm generate` **per commit against that commit's own tree** (stash uncommitted files first) and diff `public/generated/{grep-index,fs-index}.json` **programmatically** — both are single-line JSON, so `git diff` alone is useless. Revert unrelated live-data drift (`public/generated/contributions.json`, `src/generated/commits/daily-tech-digest.json`, `src/generated/file-icons.json`) with `git checkout --` before committing. **Phase 07 lost a commit to getting this wrong** — it made two comment fixes *after* its generate/diff pass and committed a briefly-stale index, needing a dedicated follow-up commit. Regenerate **last**, after the final edit in each commit. Note this phase's content move changes many index entries, so the diffs will be large but must be entirely accounted for by the move.

## Steps

- [x] **1. Port both specs + both goldens; add the project entries.**
  `git mv` `employment.spec.ts` and `employment-layout.spec.ts` into `src/features/employment/tests/ui/e2e/`. Repoint each `fixtures` import to `../../../../../../common/tests/ui/support/fixtures` — **extensionless** (D23(d)) — after verifying the depth with `path.relative`. Fix each spec's `ROOT` constant to the new depth. Leave `PERSONNEL_DIR`/`PERSONNEL_YAML` pointing at the old content paths for now — **step 3** moves the trees, and they must be green at the end of step 3, not this one.
  Create `src/features/employment/tests/ui/visual/identical.spec.ts`, modeled on `common/tests/ui/visual/identical.spec.ts`'s shape, importing the `recipes` array and filtering to an `EMPLOYMENT_OWNED_RECIPE_NAMES` set of exactly `04-employment-l0` and `05-employment-l1`. Keep the `api.github.com` abort `beforeEach`.
  `cp` all four goldens into `src/features/employment/tests/ui/visual/goldens/<vp>/`; `cmp` each against the pre-move copy **and** against v1's copy at `/Users/shev/Development/spidey-hub/tests/visual/goldens/`; only then delete the originals. Add both names to `tests/visual/identical.spec.ts`'s `SPLIT_OWNED_RECIPE_NAMES` and update its header comment.
  Add the three project entries (§Mechanics 3); extend `package.json`'s `test:e2e` with the two `employment-*` project flags and `test:visual` with the new `identical.spec.ts` path **only**. The harness spec path is added in step 6, when the spec exists — Playwright exits 1 on a path that resolves to no tests. Sweep `docs/testing/{e2e,visual}/running-tests.md` in the same commit — match the existing rows' format exactly and **verify every project name against real `playwright test --list` output before writing any row**. This sweep is an edit *and* a deletion: `docs/testing/e2e/running-tests.md` currently names employment in a "not yet real / still in legacy" list, which must **drop off** in the same change that adds employment's rows. Check both files for that stale mention rather than only appending.
  *Verify:* `pnpm build`, then the full D20(a) project list **plus** `--project=employment-1512x945 --project=employment-1920x1080` → all green. Then `pnpm build:fixtures` and the `test:visual` list including the new `identical.spec.ts` → all green. `playwright test --list` names all three new projects.

- [x] **2. R1 — promote `fileIcons.ts` to common. Its own commit, and it runs BEFORE the employment move.**
  **The order matters and is deliberate — do not swap it.** Promoting first means all three consumers repoint while they are still at their current legacy locations, so when step 3 moves employment, the state class's `fileIcons` import is already a `../../common/...` import and is covered by step 3's ordinary repoint instruction. Doing the move first would strand `employmentRecordsState.svelte.ts`'s `../../lib/fileIcons` (it resolves to a nonexistent `src/features/lib/fileIcons` from the new location) — and nothing in step 3's verify could catch it, since `test ! -d` checks, greps and `pnpm test:unit` all pass over a broken Svelte import. The tree would sit red until the next compile gate.
  `git mv src/lib/fileIcons.ts src/common/lib/file-icons.ts`. Fix its `../generated/file-icons.json` import to the new depth (**verify, do not guess**; `src/generated/file-icons.json` is a generated artifact and does not move). Repoint all three consumers — `src/components/employment-records/employmentRecordsState.svelte.ts`, `src/components/repositories/FilesPanel.svelte`, `src/components/grep-overlay/grepOverlayState.svelte.ts` — path only.
  `pnpm generate` last; diff both indexes programmatically.
  *Verify:* `test ! -e src/lib/fileIcons.ts`; `grep -rn "lib/fileIcons" src common tests scripts` returns nothing. `pnpm check` → 0 errors (this is the gate that proves all three imports resolve). The "icons still render in all three consumers" proof belongs to step 4's full build, not here — don't run the whole suite twice.

- [x] **3. Move the source, both content trees, and the yaml; fix all three out-of-context breaks; delete originals.**
  `git mv` all five component files into `src/features/employment/components/`, `src/content/personnel/` → `src/features/employment/content/personnel/` (whole directory), `fixtures/personnel/` → `src/features/employment/tests/ui/support/personnel/` (whole directory), and `personnel.yaml` → `src/features/employment/content/personnel.yaml`.
  Repoint: each component's own `../../common/...` imports to their new depths — **including `employmentRecordsState.svelte.ts`'s `file-icons` import, which step 2 made a common import**; `src/common/lib/data.ts`'s `personnel.yaml` `?raw` path; `src/content.config.ts`'s ternary — **both branches** (R4); and `PaneTree.svelte`'s `EmploymentRecords.svelte` import (R5, path only).
  **Fix breaks #1, #2 and #3** (§Background) in this same change — `views.test.ts`'s `expectedView()` literals, `docline.fixtures.json`'s three `"path"` values, `grep.spec.ts`'s one literal assertion.
  **D8 in both specs, mandatory:** update `PERSONNEL_DIR` in both, and `PERSONNEL_YAML` in `employment-layout.spec.ts`, to the new paths. Fix the two stale comments named in §Background.
  `pnpm generate` **last**; diff both indexes programmatically.
  *Verify:*
  ```bash
  test ! -d src/components/employment-records
  test ! -d src/content/personnel && test ! -d fixtures/personnel
  test ! -e src/data/personnel.yaml
  grep -rn "content/personnel\|employment-records\|data/personnel\.yaml" src common tests scripts docs | grep -v "^src/features/employment"
  ```
  The grep must return **only** intentionally-updated lines. **`pnpm check` → 0 errors** — this is the phase's largest commit and needs its own compile gate; a grep proves nothing about whether an import resolves. `pnpm test:unit` → **346 passed / 20 files** (proves breaks #1 and #2 are fixed). Record the `PaneTree` edge in Results for the auditor, naming D23(c).

- [x] **4. Full gate, from the clean committed tree.** Not folded into any prior commit.
  *Verify:* `pnpm check` → 0 errors. `pnpm lint` → exit 0. `pnpm test:unit` → 346/20, unchanged. D20(a) real build → `smoke`, `legacy-*`, `common-*`, `profile-*`, `help-*`, `boot-*`, `notifications-*`, `dashboard-*`, `employment-*` all green. D20(b) fixture build → every `*-visual` + legacy visual + `adversarial-fixtures.spec.ts` (R2's regression gate) + the **five existing** harness specs green. Employment's own harness lands in step 6 and is gated there. `public/generated/*` unchanged by this step. These runs auto-background past the 120s foreground default — monitor to completion, never sleep-poll.

- [x] **5. Golden parity — zero churn.**
  *Verify:* `diff -rq tests/visual/goldens /Users/shev/Development/spidey-hub/tests/visual/goldens` shows **only** `Only in …` lines for every recipe split out by phases 02–08 — never a `differ` line. `cmp` each of this phase's four goldens against v1's byte-for-byte. Repo-wide total stays 21 recipes × 2 viewports = 42 PNGs: root **14**, common 10, employment 4, other features 14. **No `--update-snapshots`, ever (D5).**

- [x] **6. Feature harness (D24).**
  Add the `employment` branch to `src/pages/harness/[feature].astro` (§Mechanics 4), build `EmploymentHarness.svelte` with the keydown→`handleKey()` routing and its documenting header comment (R3), the ready-element (§Mechanics 5), an `EmploymentPage` page object (§Mechanics 6), and specs at `src/features/employment/tests/ui/harness/employment.spec.ts` asserting mount plus the feature's core interactions: records rows render from the fixture personnel tree, click-selection updates the preview and timeline, `j`/`k` move the cursor, and `Enter` opens the editor. Assert kernel-free isolation via the composed `StatusBarPage`: `expect(page.statusBar.windows).toHaveCount(0)`. No goldens (D24(b)).
  Now that the spec exists, append its path to `package.json`'s `test:visual` (deferred from step 1).
  *Verify:* fixture build → `--project=employment-harness` green, and `pnpm test:visual` green as a whole with the new path in it. Real build → `test ! -d dist/harness` **and** `grep -rl "employment-harness-ready" dist --include="*.html"` empty. Use the harness-only ready-marker for that grep, **never** a bare component name — real pages legitimately contain employment markup, so grepping for `"Employment"` would report a false failure (the trap phase 07's plan had to correct). A bare `find dist -iname "*harness*"` will still match dead ~1 KB JS chunks from earlier phases — expected and ruled harmless.

- [x] **7. Record and close.**
  Run **both** citation sweeps over this phase's own context — the numbered form and the bare-noun form that phases 05, 06 and 07 each lost a round to:
  ```bash
  grep -rniE "plan\.md|phase [0-9]|defect [0-9]|decision [0-9]|iteration [0-9]|\b[fg][0-9]+\b" src/features/employment
  grep -rniE "\b(the )?(audit|cleanup|criterion|rebuild|rewrite|refactor|mockup|prototype|spec) ('s)?\b" src/features/employment
  ```
  The second is deliberately over-broad — read every hit rather than trusting a tight pattern. Known hits to expect: `employmentRecordsState.svelte.ts` ("Decision 12 in PLAN.md", "Phase 7b.2 fix", "Decision 7 in PLAN.md"), `EmploymentRecords.svelte` ("Decision 12 (PLAN.md)", "Decision 7" ×2), `TimelinePanel.svelte` ("Phase 7b.1"), `personnel.yaml` ("Personnel-Panel-Changes.md (iteration 6 rebuild)", "Decision 7"), `employment.spec.ts` ("Decision 7", "Decision 10"). Rewrite each in the file's own terms — **comment text only; a ported spec's logic is untouchable**. Judgment rule: a citation of a *process* artifact that does not exist in this repository is the violation; a reference naming a *current* constraint the code implements is not.
  Then fill in Results: every file moved, every importer updated, all three out-of-context breaks and how each was verified fixed, the D23 edges flagged for the auditor, gate outputs, the harness shape used, and the final golden distribution. Commit to `frontend-rewrite` — single-line imperative, **no body, no trailer** (toolchain R011), one reviewable unit per commit (R012).

## Acceptance criteria

1. Every file in the move table is at its new path; `src/components/employment-records/`, `src/content/personnel/`, `fixtures/personnel/`, `src/data/personnel.yaml` and `src/lib/fileIcons.ts` no longer exist.
2. All three out-of-context literal-path breaks are fixed and proven by a green `pnpm test:unit` (346/20) and a green real-build `legacy-*` run.
3. The personnel trees' on-disk depth and case are preserved exactly at both destinations; no `.DS_Store` carried over.
4. `content.config.ts`'s ternary updated on **both** branches; `build:fixtures` unmodified (R4).
5. `pnpm check` 0 errors, `pnpm lint` 0 findings, `pnpm test:unit` 346/20 unchanged.
6. D20 both invocations green, including `employment-{1512x945,1920x1080}`, `employment-visual-*`, `employment-harness`, and `adversarial-fixtures.spec.ts` still green (R2).
7. Zero golden churn; 42 PNGs repo-wide (root 14 / common 10 / employment 4 / others 14); both employment recipes byte-identical to v1 at both viewports.
8. Real build emits no `dist/harness/` directory and no HTML page referencing the employment harness marker.
9. `fileIcons.ts` promoted with all three consumers repointed and working (R1).
10. Verifier PASS **and** auditor clean on `src/features/employment` (D23 exemptions recorded with the exemption named).
11. Results filled in; no `(executor fills in)` placeholder.

## Stop conditions

- **No behavior changes.** No record-grouping, timeline, preview or keyboard-model edits. If a spec goes red on *logic*, the move is wrong, not the spec. **This does not forbid D8 path updates** — repointing an import or a literal filesystem path a move invalidated is required. The line is behavior vs. location.
- **No reshaping the personnel tree.** Depth, directory names and on-disk case are load-bearing through `generateId`. Move whole parent directories; never rename a leaf, never flatten a sub-role.
- **No rewriting moved code** — no splitting `employmentRecordsState.svelte.ts` (R8: it is D23(e)-exempt, leave its `private` fields and field ordering alone), no normalizing either ported spec.
- **No editor changes** — the editor is common's code (D9). Employment only consumes it.
- **Do not touch `adversarial-fixtures.spec.ts`, `build:fixtures`, or `src/pages/employment.astro`** (R2, R4, §Context). If you believe one needs editing, stop and report.
- **No golden regeneration**, no `--update-snapshots`.
- **No behavioral edits outside the context** — path updates only.
- If a step turns out to rest on a false assumption, **stop and report** rather than redesigning; the orchestrator updates this plan.

## Results

**Status: executed 2026-09-12, all 7 steps complete, all gates green on the final committed tree — pending verifier/auditor review before phase close.** Six commits on `frontend-rewrite`:

1. `f3e96ab` — Port employment's e2e specs and goldens into src/features/employment
2. `dd7ed5b` — Promote fileIcons.ts to common/lib/file-icons.ts
3. `62b3366` — Move employment components and personnel content into src/features/employment
4. `7e94a52` — Add the employment feature harness route, wrapper, page object and spec
5. `6562382` — Strip stale v1 process citations from employment's comments
6. `b12c97c` — Record phase 08 results and close the employment plan (this Results section's first draft; corrected below by the commit that lands after this one, since that draft undercounted the commit list and overstated one gate run)

### Files moved (move table, all verbatim except path-only import repoints)

| from | to |
|---|---|
| `src/components/employment-records/EmploymentRecords.svelte` | `src/features/employment/components/EmploymentRecords.svelte` |
| `src/components/employment-records/RecordsPanel.svelte` | `src/features/employment/components/RecordsPanel.svelte` |
| `src/components/employment-records/TimelinePanel.svelte` | `src/features/employment/components/TimelinePanel.svelte` (byte-identical move; only later touched for the comment sweep) |
| `src/components/employment-records/PreviewPanel.svelte` | `src/features/employment/components/PreviewPanel.svelte` |
| `src/components/employment-records/employmentRecordsState.svelte.ts` | `src/features/employment/components/employmentRecordsState.svelte.ts` |
| `src/content/personnel/` (9 `.md`) | `src/features/employment/content/personnel/` — depth/case preserved, `git mv` on whole parent dirs |
| `fixtures/personnel/` (9 `.md`) | `src/features/employment/tests/ui/support/personnel/` — same |
| `src/data/personnel.yaml` | `src/features/employment/content/personnel.yaml` |
| `tests/e2e/employment.spec.ts` | `src/features/employment/tests/ui/e2e/employment.spec.ts` |
| `tests/e2e/employment-layout.spec.ts` | `src/features/employment/tests/ui/e2e/employment-layout.spec.ts` |
| `tests/visual/goldens/<vp>/{04-employment-l0,05-employment-l1}.png` (×2 vp) | `src/features/employment/tests/ui/visual/goldens/<vp>/` |
| `src/lib/fileIcons.ts` (R1 promotion) | `src/common/lib/file-icons.ts` |

Three untracked `.DS_Store` files traveled with the `git mv` of `src/content/personnel/` (filesystem rename, not a git operation) and were deleted post-move; destination trees confirmed clean of them.

### Every importer updated (path-only)

- `EmploymentRecords.svelte`, `RecordsPanel.svelte`, `PreviewPanel.svelte`, `employmentRecordsState.svelte.ts`: own `../../common/...` imports re-depthed to `../../../common/...`.
- `employmentRecordsState.svelte.ts`: `../../lib/fileIcons` → (step 2) `../../common/lib/file-icons` → (step 3, same move) `../../../common/lib/file-icons`.
- `src/components/repositories/FilesPanel.svelte`, `src/components/grep-overlay/grepOverlayState.svelte.ts`: `../../lib/fileIcons` → `../../common/lib/file-icons` (path-only, both still in the transient legacy tree).
- `src/common/lib/file-icons.ts`'s own `../generated/file-icons.json` → `../../generated/file-icons.json` (generated artifact itself never moves).
- `src/common/lib/data.ts`: `../../data/personnel.yaml?raw` → `../../features/employment/content/personnel.yaml?raw`.
- `src/content.config.ts`: personnel `base:` ternary, **both** branches — `useFixtures ? "src/features/employment/tests/ui/support/personnel" : "src/features/employment/content/personnel"`.
- `src/common/components/PaneTree.svelte`: `../../components/employment-records/EmploymentRecords.svelte` → `../../features/employment/components/EmploymentRecords.svelte` — **flagged for the auditor as D23(c)**: a common→feature import edge whose direction pre-existed the move (same class as `PaneTree.svelte`→`Profile.svelte`/`Dashboard.svelte`).
- Both ported specs: `PERSONNEL_DIR` (both) and `PERSONNEL_YAML` (`employment-layout.spec.ts`) repointed; `ROOT` re-depthed to `../../../../../..`; fixtures import repointed to `../../../../../../common/tests/ui/support/fixtures` (extensionless, D23(d)); a stale `tests/e2e/editor-vim.spec.ts` comment citation repointed to `common/tests/ui/e2e/editor-vim.spec.ts`; `employment-layout.spec.ts`'s "fixtures/personnel deliberately does not exist" header corrected to state the real (fixture-switched) mechanism.
- `playwright.config.ts`: three project entries added (`employment-<viewport>`, `employment-visual-<viewport>`, `employment-harness`) after `dashboard-harness`, per §Mechanics 3 verbatim.
- `package.json`: `test:e2e` gained `--project=employment-1512x945 --project=employment-1920x1080`; `test:visual` gained `src/features/employment/tests/ui/visual/identical.spec.ts` and `src/features/employment/tests/ui/harness/employment.spec.ts`.
- `docs/testing/{e2e,visual}/running-tests.md`: rows added for all three new projects, "employment" dropped from both files' "not yet real" lists.
- `src/pages/harness/[feature].astro`: `employment` branch added to `getStaticPaths`, the `personnel`/`personnelEntries` data assembly, and the `EmploymentHarness` mount block.
- `tests/visual/identical.spec.ts`: `SPLIT_OWNED_RECIPE_NAMES` gained `04-employment-l0`/`05-employment-l1` (12 → 14 entries); header comment updated.

### The three out-of-context literal-path breaks — how each was verified fixed

1. **`common/tests/unit/views.test.ts`** — `expectedView()`'s two literals (`src/content/personnel/` prefix, `src/components/employment-records/EmploymentRecords.svelte` exact match) repointed to the new real paths; the three depth-agnostic-regex literals lower in the file (lines feeding `grepPathToView()` directly) also refreshed for truthfulness even though they still passed unchanged. Verified: `pnpm test:unit` → 346/20 both before-fix-would-fail and after-fix-passes were observed (346/20 achieved only once the literals were updated to match the post-move real `public/generated/grep-index.json`).
2. **`common/tests/unit/docline.fixtures.json`** — all three `"path"` values (`enaimco/software-developer/{full-time,part-time,co-op}/role.md`) repointed to `src/features/employment/content/personnel/...`. Verified: `docline.test.ts`'s real `readFileSync` against these paths passes as part of the same 346/20 unit run (an `ENOENT` here would have failed that file specifically).
3. **`tests/e2e/grep.spec.ts`** — the one literal `data-path` assertion repointed to `src/features/employment/content/personnel/enaimco/software-developer/co-op/role.md`. Verified: `legacy-1512x945`/`legacy-1920x1080` › `grep.spec.ts` › "Enter on an employment content hit lands in the employment view" passed inside the 1012-test D20(a) real-build run.

Post-step-3 sweep (`grep -rn "content/personnel\|employment-records" src common tests scripts docs | grep -v "^src/features/employment"`) returned only intentionally-updated lines (the new `content.config.ts` ternary, `data.ts`'s new import, the three fixed `views.test.ts` lines, `docline.fixtures.json`'s three fixed paths, `grep.spec.ts`'s fixed literal) plus pre-existing, out-of-scope stale prose and an unrelated screenshot-label string in `scripts/capture-screenshots.mjs` — none of which reads employment's tree by path or asserts against it, so none was touched (out of this phase's declared scope).

**Correction, per the closing verification:** an earlier version of the sentence above enumerated `src/common/content/cmdline.yaml` and `src/data/repositories.yaml` as stale hits of *this* sweep. They are not — re-running that exact grep matches neither file (`cmdline.yaml`'s "employment" is a space-separated command name, not the hyphenated `employment-records`/`content/personnel` pattern the sweep searched). The one genuine out-of-scope stale hit is **`src/content.config.ts`'s own header comment** (lines 10–17), which still describes `fixtures/personnel/` and `src/content/personnel/` and cites "Phase 7b.2" two lines above the ternary this phase correctly repointed. The sweep also surfaces `src/common/lib/views.ts:99`, a docstring example that is fine. This was enumeration drift in a descriptive sentence; no load-bearing gate claim was affected.

### D23 edges flagged for the auditor

- **D23(c)** — `PaneTree.svelte` → `EmploymentRecords.svelte`, path-only update, direction pre-existed the move (see above).
- **D23(e)** — `employmentRecordsState.svelte.ts`, relocated verbatim (save for the path-only import repoints and this step's comment-citation rewrites), is expected to draw classes.md findings (`private` rather than `#` fields, public mutable `$state` written by sibling components via `bind:this`, field ordering — `sel`/`editorOpen`/`editorRef` interleaved with derived/method members) — all pre-exempted by 00-phases.md's generalized D23(e) rule for any verbatim-relocated `<name>State.svelte.ts`. Not modified beyond comment text.
- **R2 regression gate** — `tests/visual/adversarial-fixtures.spec.ts` stayed untouched in the legacy tree and remained green throughout (part of every D20(b) run).

### Gate results (actual numbers observed)

- `pnpm check` → 0 errors, every run (steps 2, 3, 4, 7, and the final post-sweep re-check).
- `pnpm lint` → exit 0.
- `pnpm test:unit` → **346 passed / 20 files**, unchanged throughout, including the final run on the fully-committed tree (confirms breaks #1/#2 fixed with no new/missing unit tests).
- D20(a) real build (`smoke` + `legacy-*` + `common-*` + `profile-*` + `help-*` + `boot-*` + `notifications-*` + `dashboard-*` + `employment-{1512x945,1920x1080}`, 16 projects) → **1012 passed**, run at step 1, step 4, and — the run that matters, since it covers commit `6562382`'s index-content churn — **again from the fully-committed tree after the citation-sweep commits**, all green. (Step 7's own post-sweep spot-check ran the two `employment-*` projects only, 44/44 — that was not a substitute for the full 1012-test run, which is the one recorded here.) One transient 6-failure `legacy-*`/`repositories.spec.ts` run occurred mid-phase, root-caused to the executor's own build/revert-drift ordering (dist built against fresh live commit JSON, then that file reverted before the spec read it from disk) — not a real regression; a clean rebuild + rerun confirmed 12/12 passing and the full 1012 passed immediately after, and again on every later full run.
- D20(b) fixture build + `pnpm test:visual` → **73 passed** (step 1/4, before the harness existed) → **79 passed** (step 6, step 7's employment-only spot-check, and again as a full run from the fully-committed tree after the citation-sweep commits), including `adversarial-fixtures.spec.ts` (R2 gate) green throughout.
- `--project=employment-harness` alone → 6/6 passed (step 6 and step 7's spot-check).
- Real build dist checks, re-run against the final committed tree: `test ! -d dist/harness` true; `grep -rl "employment-harness-ready" dist --include="*.html"` empty (exit 1); a dead ~1 KB `EmploymentHarness.<hash>.js` chunk present in `dist/_astro/` (pre-ruled harmless, Deferred).

### Harness shape used

`EmploymentHarness.svelte` follows the **NotificationsHarness** model, not DashboardHarness: `EmploymentRecords.svelte` exports `handleKey()` and attaches no listener of its own (same shape as `Notifications.svelte`), so the wrapper holds `bind:this={ref}` + `<svelte:window onkeydown={(e) => ref?.handleKey(e)} />` + an `onMount`-flipped `ready` flag + `data-testid="employment-harness-ready"`. Props (`personnel`, `personnelEntries`) come straight from the route's `getPersonnel()`/`getCollection("personnel")` calls, fixture-switched automatically by `content.config.ts`; `isFocused={true}` is hardcoded in the wrapper (only mounted instance). `EmploymentPage.ts` composes `StatusBarPage` (never redefines kernel-chrome locators) and exposes `rows`/`timelineNodes`/`previewPath`/`editorScroller` getters plus `pressKey()`/`openHarness()`. The harness spec (6 tests) derives its row-count/order expectations from a `readdirSync` walk of the fixture tree (same "derive the expectation from the source" convention as the ported e2e specs) rather than hardcoding the count; all assertions are web-first (`toHaveAttribute`/`toHaveCount`/`toBeVisible`), per Mechanics 5b.

### Citation sweep (step 7)

Both mandated greps plus a manual follow-up (v1 doc-name literals — `UI-Mockups/...`, `*.dc.html`, `Personnel-Panel-Changes.md`, `docs/changes/...` — that neither regex's word-boundary shape catches) found and fixed real hits, comment/test-title text only, in: `employmentRecordsState.svelte.ts` (removed "Decision 12 in PLAN.md", "Phase 7b.2 fix", "Decision 7 in PLAN.md", "UI-Mockups/.../Personnel.dc.html", "docs/changes/employment-records-v2.md"), `EmploymentRecords.svelte` ("Decision 12 (PLAN.md)", "Decision 7" ×2, "UI-Mockups/...", "Personnel-Panel-Changes.md", "docs/changes/..."), `TimelinePanel.svelte` ("UI-Mockups/...", "Personnel-Panel-Changes.md", "Phase 7b.1"), `personnel.yaml` ("UI-Mockups/...", "Personnel-Panel-Changes.md (iteration 6 rebuild)", "docs/changes/...", "Decision 7"), and `employment.spec.ts` (the `describe` title's "Decision 10 — enabled" parenthetical). Both sweeps re-ran clean afterward. No ported spec's logic/assertions were touched — only comment prose and one `describe` title string. Re-verified after the sweep: `pnpm check`/`lint`/`test:unit` green, employment e2e (44/44) and visual+harness (10/10) green, and golden byte-identity to v1 re-confirmed (zero pixel impact from comment-only edits, as expected).

### Final golden distribution

Repo-wide total unchanged at **21 recipes × 2 viewports = 42 PNGs**: root **14** (7 recipes), common **10**, employment **4** (04-employment-l0, 05-employment-l1 × 2 viewports), other features **14** (profile 2, help 4, boot 4, notifications 2, dashboard 2). All four employment goldens confirmed byte-identical to both their pre-move copies and v1's originals (`cmp`, zero diff) at every check; `diff -rq tests/visual/goldens <v1>/tests/visual/goldens` showed only `Only in ...` lines, never `differ`, at every check.

### Deviations from the plan

None. Steps executed in the specified order (fileIcons promotion before the employment move); mechanics reused verbatim; no stop condition was triggered.

### Post-close audit fix round (2026-09-12)

The auditor raised three findings; the orchestrator ruled two exempt and one required a fix:

- **Fixed — comments.md R003, 7 stale-path citations** (comment text only, no logic/assertion changes, verified against real targets before writing): `employment-layout.spec.ts:38` (`src/data/personnel.yaml` → `src/features/employment/content/personnel.yaml`), `employmentRecordsState.svelte.ts:114` (`src/content/personnel/` → `src/features/employment/content/personnel/`), `employment.spec.ts:31` (`tests/e2e/nav.spec.ts`/`sessions.spec.ts` → `common/tests/ui/e2e/...`), `employment.spec.ts:32`, `employmentRecordsState.svelte.ts:33`, `employmentRecordsState.svelte.ts:53` (all three `tests/visual/recipes.ts` → `common/tests/ui/support/recipes.ts`), `identical.spec.ts:29` (`tests/visual/capture-goldens.mjs` → `common/tests/ui/support/capture-goldens.mjs`, this file being authored this phase with no verbatim-port defense). Two of the seven (hits 5/6) had survived the step-7 citation-sweep commit (`6562382`) despite that commit hand-editing the same paragraphs — a lesson for later phases: re-read every path a comment block mentions when rewriting it, not just the clause motivating the edit. Re-verified after the fix: both citation sweeps clean, `pnpm check` 0 errors, `pnpm test:unit` 346/20 unchanged. Long e2e/visual gates were not re-run for this round (comment-only edits, and the orchestrator was running them concurrently against the same tree).
- **Ruled exempt (D23) — classes.md R002 on `handleKey(e): boolean`.** The boolean return is the kernel's delegation contract (`Terminal.svelte`'s `if (ref.handleKey(e)) return` at lines 72/188/204/216, meaning "I consumed this key"); void would break keydown routing for every pane program. Not touched.
- **Ruled exempt (D23) — files-and-naming R011 on the pure helpers living inside `employmentRecordsState.svelte.ts`** (`parseMonthYear`, `splitDates`, `monthsBetween`, `dirSegmentsOf`). Extracting them is the split the stop conditions forbid; deferred to the post-migration hardening pass alongside the unit tests that extraction would then make possible. Not touched.

Commit for this round: single-line imperative, no body, no trailer, comment-only diff.

### Closing verification (orchestrator, 2026-09-12)

**Verifier: PASS** on all 11 acceptance criteria. It re-ran `pnpm check` (0 errors), `pnpm lint` (exit 0) and `pnpm test:unit` (346/20) itself at HEAD rather than accepting the numbers above, and — decisively — **proved the three out-of-context literal-path breaks are load-bearing rather than vacuously green**, by mutation: reverting `views.test.ts`'s `expectedView()` literals produced a real 2-test mismatch; reverting one `docline.fixtures.json` path produced `ENOENT` on a real `readFileSync`; and the live `public/generated/grep-index.json` was confirmed to carry the new personnel path and not the old one. Every probe was restored and the tree left clean. It also verified the personnel trees match v1 exactly at both destinations (9 files, identical depth/case, `diff -rq` empty, no `.DS_Store`), both ternary branches, R1's promotion with all three consumers, and every "do not touch" fence via `git diff` over the full range.

**Auditor: clean** — zero blocking violations outside the two named D23 exemptions. All 7 repoints confirmed to land on targets that exist on disk, and a whole-context re-sweep (every path-shaped string in every component, spec, yaml and `role.md` frontmatter) found **no additional stale reference** — including the class that had previously survived a hands-on edit to its own paragraph. Both citation sweeps clean, plus the v1-doc-name-literal and punctuation-adjacent variants. The three surviving "mockup" mentions were each checked and correctly retained: none names an artifact, and each states a constraint that remains true and disk-verifiable with the word struck out. `05dda3f` confirmed comment-text-only; both exempted findings confirmed untouched.

**Gates (orchestrator-run, on the fully-committed tree):** D20(a) real build **1012 passed** (1.9m, clean single run — no `repositories.spec.ts` flake reproduced); D20(b) fixture build **79 passed** (24.0s), including `employment-visual-*` on both recipes at both viewports, `employment-harness` 6/6, and `adversarial-fixtures.spec.ts` (R2's regression gate); golden parity **zero `differ` lines**, 42 PNGs repo-wide.

**Index self-consistency follow-up (`3ad7964`).** `05dda3f` edited four files under `src/` without regenerating, leaving the committed `fs-index`/`grep-index` stale against their own tree — the same toolchain R012 lapse phase 07 hit, recurring one commit after this plan's own §Mechanics 8 warned about it. Caught by programmatic diff (the four files were recorded at pre-fix sizes), regenerated, and committed separately. Two findings from that work worth carrying forward: (a) `fs-index`/`grep-index` are **inherently unstable across runs** because they record the size of network-sourced `contributions.json` — so a "did it change?" check must diff entries, never whole files; (b) `src/generated/file-icons.json` is by contrast **deterministic and tree-derived**, and had silently carried staleness since **phase 02** — it was committed alongside the indexes rather than reverted as live drift, which is why entries for `common/tests/unit/` files correctly dropped out (`generate.mjs` never walks `common/`). Later phases should expect further `file-icons.json` churn as contexts move; that is correct, not drift.

**Known out-of-scope remainder:** `src/content.config.ts`'s header comment (lines 10–17) still describes `fixtures/personnel/`/`src/content/personnel/` and cites "Phase 7b.2", two lines above the ternary this phase repointed. Correctly outside this phase's declared wiring (only the ternary was mandated); recorded in `00-phases.md`'s Deferred list for whichever phase next touches that file.

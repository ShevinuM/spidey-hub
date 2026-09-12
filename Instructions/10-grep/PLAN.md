# Phase 10 — grep

> **Status: planned 2026-09-12, not started.** Predecessor phase 09 (repositories) closed 2026-09-12. Binding decisions: `Instructions/00-phases.md` (the only cross-phase document this plan may read). This plan is self-contained: every mechanism it needs is stated here verbatim, so the executor never reads another phase's folder.
>
> **This is a small, low-fallout phase — the opposite of phase 09 — and the plan's job is to say precisely why, so nobody spends the phase hunting for breakage that does not exist.** Grep owns 4 components + 1 pure lib + 1 yaml + 1 fixture + 2 specs + 2 recipes. Its lib has **zero runtime consumers outside the feature**, its content is **not a content collection**, and `views.ts` carries **no grep anchor at all**. The whole out-of-context blast radius is **one import line in `Terminal.svelte`, one in `cmdline.spec.ts`, one `?raw` line in `data.ts`, one `cp` source in `package.json`, and five stale comment citations.** Two inherited warnings from phase 09 are **falsified here and do not fire** — see R2 and R3. Read §Background's rulings R1–R7 and the break table before step 1.

## Context

**`src/features/grep`.** Everything below is scoped to it except the declared out-of-context wiring.

**Declared out-of-context wiring** (mechanical only — D24's closing clause; no behavioral edits outside the context, ever):

| file | why |
|---|---|
| `playwright.config.ts` | three project entries (§Mechanics 3) |
| `package.json` | `test:e2e` two project flags; `test:visual` two spec paths; `build:fixtures` **one** `cp` source path (D22, R4) |
| `src/bootstrap/Terminal.svelte:54` | `GrepOverlay.svelte` import path — path only (R5) |
| `src/common/lib/data.ts` | `grep.yaml` `?raw` re-point (D17) + its stale header prose (R6) |
| `src/common/lib/views.ts:116` | one stale `fixtures/grep-index.json` comment citation — **comment only, zero code edits** (R3) |
| `src/common/lib/repo-tree.ts:49` | one stale `src/lib/grep.ts` example path in a docstring |
| `src/lib/shell.ts:69` | one stale `src/lib/grep.ts` comment citation (phase 11's tree; comment only) |
| `common/tests/unit/views.test.ts:95` | one stale `fixtures/grep-index.json` comment citation — **comment only; `expectedView()` is NOT edited** (R3) |
| `common/tests/ui/e2e/cmdline.spec.ts:25` | `src/lib/grep` import re-point (R1, D23(c)) |
| `src/pages/harness/[feature].astro` | one `grep` branch (D24) |
| `tests/visual/identical.spec.ts` | `SPLIT_OWNED_RECIPE_NAMES` gains two names; header comment |
| `docs/testing/{e2e,visual}/running-tests.md` | project rows + "not yet real" list narrows to `(shell-fs)` (doc-practice, same commit) |
| `tests/visual/goldens/<vp>/{09-grep-empty,10-grep-query}.png` | deleted after the copies are verified |

**Explicitly NOT touched by this phase** — verified on disk 2026-09-12, not assumed. If you believe one needs editing, **stop and report**:

- **`src/content.config.ts` — zero edits.** `grep -n -i "grep" src/content.config.ts` returns **nothing**. Grep is not a content collection: there is no `src/content/grep/` directory and no `grep` entry in the config. Its yaml is a plain `?raw` data file (R2). 00-phases.md's Deferred item assigning that file's stale header to "whichever phase next edits it (09 for repositories, **10 for grep**, 11 for shell-fs)" **does not fire for this phase** — phase 09 already rewrote the header under its R8, and this phase does not open the file.
- **`src/common/lib/views.ts`'s `grepPathToView()` — zero code edits** (R3). Only its line-116 comment.
- **`common/tests/unit/views.test.ts`'s `expectedView()` — zero literal edits** (R3). Only its line-95 comment.
- **`scripts/generate.mjs` — zero edits.** `GREP_ROOT_SUBDIRS = ["src","scripts","tests"]` (line 282) stays valid: every moved file stays under `src/`. No `srcDir`-equivalent constant names a grep path, and no comment in the file cites a grep **source** path (verified by the §Background sweep — its many `grep-index` mentions all name the *generated output*, which does not move).
- `public/generated/grep-index.json` — generated build output. Regenerated, never hand-edited, never moved.
- `src/lib/{shell,shellIndex}.ts` and `src/components/Shell.svelte` beyond the one `shell.ts:69` comment — phase 11's context. Their `fetch("/generated/grep-index.json")` calls are **runtime URLs**, not filesystem paths, and are unaffected.
- `tests/e2e/shell.spec.ts` and `common/tests/ui/e2e/cmdline.spec.ts` beyond the one import line — **both read `public/generated/grep-index.json` (the real index at the repo root), not the fixture.** Verified: `cmdline.spec.ts:683`, `shell.spec.ts:65`. Neither breaks.
- `tests/unit/{freePort,keyframes-dedup}.test.ts` — not feature-owned; stay in `tests/unit/` until the `tests/audits/` boundary-fitness pass (architecture R009, Deferred).
- `src/pages/*.astro` — they consume `getGrep()` from `common/lib/data`, whose module path does not change. **No page edit.**
- `vitest.config.ts` — already globs `src/features/*/tests/unit/`. **No edit.**

## Objective

The grep overlay — its four components, its pure search lib, its yaml and its fixture index — lives in `src/features/grep/`, moved verbatim, with `grep.spec.ts` and `grep.test.ts` green, the `09-grep-empty` / `10-grep-query` goldens byte-identical at both viewports with zero churn, every literal path the move invalidates fixed in the same change (D8), no feature→feature edge authored, and a `grep-harness` route mounting `GrepOverlay` with no Terminal kernel.

## Background — verified inventory

Every path, line number and count below was verified on disk on 2026-09-12. **Do not re-derive; do verify before editing** — grep for the symbol, do not trust a line number.

### Move table

| from | to | size |
|---|---|---|
| `src/components/grep-overlay/GrepOverlay.svelte` | `src/features/grep/components/GrepOverlay.svelte` | 202 lines |
| `src/components/grep-overlay/grepOverlayState.svelte.ts` | `…/components/grepOverlayState.svelte.ts` (D15: state classes keep `<name>State.svelte.ts`) | 247 lines |
| `src/components/grep-overlay/QueryListPanel.svelte` | `…/components/QueryListPanel.svelte` | 74 lines |
| `src/components/grep-overlay/PreviewPanel.svelte` | `…/components/PreviewPanel.svelte` | 52 lines |
| `src/lib/grep.ts` | **`src/features/grep/lib/grep.ts`** — stays in the feature, **not** promoted (R1) | 85 lines |
| `src/data/grep.yaml` | `src/features/grep/content/grep.yaml` (D17, R2) | 46 lines |
| `fixtures/grep-index.json` | `src/features/grep/tests/ui/support/grep-index.json` (D22 source only; `dist/` destination unchanged — R4) | 24 entries |
| `tests/e2e/grep.spec.ts` | `src/features/grep/tests/ui/e2e/grep.spec.ts` | 361 lines |
| `tests/unit/grep.test.ts` | `src/features/grep/tests/unit/grep.test.ts` | 91 lines |
| `tests/visual/goldens/<vp>/{09-grep-empty,10-grep-query}.png` | `src/features/grep/tests/ui/visual/goldens/<vp>/` | 4 files |

`src/components/grep-overlay/` holds exactly those four files and nothing else — verified; the directory is deleted when empty. **After this phase `src/components/` holds only `Shell.svelte`, `src/lib/` holds only `shell.ts` and `shellIndex.ts`, `src/data/` holds only `shell.yaml`, `tests/e2e/` holds only `shell.spec.ts`, and `fixtures/` holds only `fs-index.json` — all of it phase 11's.**

### Orchestrator rulings (do not re-litigate — architecture R003)

- **R1 — `src/lib/grep.ts` stays in the feature at `src/features/grep/lib/grep.ts`. It is NOT promoted to `common/lib/`.** The 2026-08-29 stub made this conditional on the consumer graph ("if runtime code in common/bootstrap consumes it too, promote; if only the spec does, it stays"). **The graph was resolved and the condition selects the feature.** Every importer was found by grepping the basename and then **resolving each relative specifier against the filesystem** (never substring-matching — 00-phases.md's phase-09 detection note): (a) `src/components/grep-overlay/grepOverlayState.svelte.ts:10` — the feature's own state class, moving with it; (b) `tests/unit/grep.test.ts:8` and (c) `tests/e2e/grep.spec.ts:22` — **both move into the feature this phase**, so they stop being cross-context at all; (d) `common/tests/ui/e2e/cmdline.spec.ts:25` — a **test-only** import of `search`/`formatCount`/`RepoFile` used at lines 685–689 to compute the expected `grep-counter` text rather than hardcoding it. **Zero runtime consumers** exist in `src/common/`, `src/bootstrap/` or `src/pages/*.astro` — verified by direct grep of each tree. D16's bar ("≥2 verified real consumers" outside the owner) is therefore met **once, by a test**, and is not met. Note the one apparent hit that is not one: `common/tests/ui/support/reference/Homepage.dc.html:630` contains `import { search } from "../lib/grep";` **inside a backtick string** — it is the vendored v1 source dump, not a module import, and must not be counted or edited.
  **The surviving `cmdline.spec.ts` edge is sanctioned and gets no shim.** After the move it reads `src/features/grep/lib/grep.ts` — a **common→feature** edge in a test tree, whose *direction pre-existed the move* and whose target "merely left the transient tree for its real context." That is D23(c) verbatim. It is explicitly **not** the forbidden shape: architecture R004 bans *feature→feature*, and phase 09's R11 ruling exists to convert feature→feature into exactly this common→feature form. **Do not route it through `common/tests/ui/support/fixtures.ts`** — R11's re-export trick exists to *reach* this shape, not to launder one that already has it, and re-exporting production source through a test-support module would be strictly worse. Repoint the one import line, record the edge in Results naming D23(c), and leave the spec's body untouched (D23(a)).
- **R2 — grep has no content collection; its yaml is a plain `?raw` data file and `src/content.config.ts` is never opened.** Verified: no `src/content/grep/` directory exists, and `grep -n -i "grep" src/content.config.ts` returns zero matches. `src/data/grep.yaml` (46 lines) is read only through `src/common/lib/data.ts:26`'s `import grepRaw from "../../data/grep.yaml?raw"`, keyed `"grep.yaml"` in the `RAW` map (line 41) and served by `getGrep()` (line 420). It moves to `src/features/grep/content/grep.yaml` under D17, and the **only** wiring edit is that one `?raw` specifier. There is no fixture ternary, no `base:` switch, and no `getCollection` call to update. **`src/data/` will hold only `shell.yaml` afterwards**; D17's "remove the `src/data/` leg when the last yaml leaves" therefore remains phase 11's, not this phase's.
- **R3 — the inherited `content/grep/` load-bearing-anchor warning is FALSIFIED and does not fire. `views.ts` needs zero code edits and `views.test.ts` needs zero literal edits.** 00-phases.md's phase-09 lesson (1) instructed phases 10–11 to preserve their `content/<collection>/` segment pair and to "verify against `views.ts` before moving." **The verification was run and the premise is absent.** `src/common/lib/views.ts`'s `grepPathToView()` (lines 130–142) carries exactly six real-index anchors — `content/personnel/`, `EmploymentRecords.svelte`, `content/repositories/`, `Repositories.svelte`, `Wallpaper.svelte`, `Profile.svelte` — and **none of them relate to grep**. There is no `content/grep/` anchor and no `GrepOverlay.svelte` exact-match. The reason is structural, not accidental: those anchors route a *search hit* to the view that owns the matched file, and grep is the overlay doing the searching, not a destination view. Correspondingly `common/tests/unit/views.test.ts`'s `expectedView()` (lines 28–36) contains **no grep literal** — grep's files route to `null` today.
  **What must still be proven, and how:** after the move, grep's new paths (`src/features/grep/components/GrepOverlay.svelte`, `…/content/grep.yaml`, `…/lib/grep.ts`, `…/tests/ui/support/grep-index.json`) enter the real index and must **still route to `null`**. They do — none matches any of the six anchors, and the bare-word fallback (lines 136–141) is gated to paths **not** starting with `src/` or `tests/`, which excludes every new path. `views.test.ts`'s first two tests assert exactly this against the freshly regenerated real index, so **a green `pnpm test:unit` after `pnpm generate` is the proof** and no whitelist edit is correct. **If you find yourself adding a line to `expectedView()`, stop and report** — it would mean a grep path started routing, which is a behavior change this phase forbids.
- **R4 — `fixtures/grep-index.json`'s BYTES ARE FROZEN; only its location and the one `cp` source move.** The stub asked whether it embeds real v1 tree paths and said a yes is "golden-affecting → report, do not absorb." **Answer: it is a 24-entry synthetic prototype snapshot, and only 4 of its 24 paths exist on disk today** (`package.json`, `astro.config.mjs`, `src/pages/index.astro`, `src/lib/grep.ts`); the other 20 (`README.md`, `src/components/GrepOverlay.svelte`, `src/lib/repo-index.ts`, `src/layouts/Shell.astro`, …) are prototype fiction already documented as such by `views.ts:116–128`. This is **fixture data, not a citation** — the same class as phase 09's "Phase 7b.2" body text in `all-projects.json`, which that phase correctly left alone. It is also **pixel-load-bearing**: recipe `10-grep-query` types `svelte` and the golden renders whatever this file contains, so editing one byte is a golden rebaseline, which D5 forbids outside a deliberate pass. **Move the file, change nothing inside it.** Consequently:
  - `package.json`'s `build:fixtures` clause changes **source only**: `cp fixtures/grep-index.json dist/generated/grep-index.json` → `cp src/features/grep/tests/ui/support/grep-index.json dist/generated/grep-index.json`. The `dist/generated/` destination is **unchanged**, and the `fs-index.json` clause beside it is **untouched** (phase 11's).
  - **`tests/unit/grep.test.ts:38`'s `["src/lib/grep.ts", 0]` is FIXTURE CONTENT, not a real-tree path, and must NOT be repointed.** It asserts a hit against the frozen fixture's own entry. Repointing it to `src/features/grep/lib/grep.ts` would make the test assert a path the fixture does not contain and turn it red. The same applies to its trailing comment. **This is the single most likely mistake in the phase**: a path-existence sweep flags this line, and acting on the flag breaks the suite. The judgment rule — a citation of something absent is a violation, a reference to data the code actually consumes is not — resolves it: this is the data.
  - Once moved under `src/`, the fixture file itself becomes an entry in the **real** generated index (it leaves `fixtures/`, which is not grep-indexed, for `src/`, which is) — exactly as repositories' fixture `.md` files did in phase 09. Expect that entry; it routes `null` (R3).
- **R5 — `Terminal.svelte`'s `GrepOverlay` import is a path-only update, recorded as D23(c)-adjacent; the mount itself is unchanged.** `src/bootstrap/Terminal.svelte:54` imports the component and line 973 mounts it as `<GrepOverlay bind:this={grepRef} {grep} onNavigate={core.switchToView} />`. **bootstrap→feature is the sanctioned wiring direction** (D10: pages are thinned to import only from `bootstrap/`, and `bootstrap/` wires features), so this is not the common→feature case D23(c) covers — it needs no exemption at all, only a correct path. Note grep is **always mounted** and kernel-adjacent (Terminal owns the sole window keydown listener, lines 360–367, and delegates at lines 785–787 via `if (grepRef?.handleKey(e)) return`) — unlike every prior feature phase, grep does **not** hang off `PaneTree`. The many other `GrepOverlay`/`grep` mentions in `Terminal.svelte` are **bare component names and prose, not paths** — line 54 is the only edit in that file.
- **R6 — `data.ts`'s stale header prose is narrowed in the same change as the `?raw` repoint.** Lines 7–8 read "every other feature's yaml still lives in `src/data/`" — after this phase that is exactly one file, `shell.yaml`. Narrow the sentence to say so, and **re-read the whole comment block while doing it** (phase 08 had two stale paths survive a sweep commit that hand-edited their own paragraph); line 14's `src/data/` mention is part of a still-accurate bundling rationale and stays.
- **R7 — the four "relocation refactor" comment citations are stripped, not reworded.** `grepOverlayState.svelte.ts:2`, `QueryListPanel.svelte:3`, `PreviewPanel.svelte:3` (and `GrepOverlay.svelte`'s header, if it carries the same phrasing — verify) each say the file was "moved out of `GrepOverlay.svelte` during the folder+state-class relocation refactor," followed by "Pure relocation: same DOM, testids, classes, and inline styles as the original inline markup." Both halves are **historical provenance, not current constraints** — comments.md **R008** bans a "plan, iteration, phase, or 'locked decision' reference" and says "the moment the constraint a comment describes stops holding, delete the comment — don't leave it updated-in-place as a historical marker," and **R003** says a comment that adds no value is deleted, not reworded. Keep the one clause that describes what the file *is* (e.g. "Right pane: matched-file preview"); delete the refactor-history sentences. **Comment text only — no markup, testid, class or style may change.** Note the bare-noun sweep regex in 00-phases.md does **not** catch these (it requires a space after the matched word and these read "refactor."), which is why they are named here explicitly; run the sweep *and* check these four files by hand.

- **R8 — the spec's own relocation changes its rank in the index it queries. Fix `grep.spec.ts`'s `Repositories.svelte` query by constructing it at run time. (Orchestrator ruling 2026-09-12, after the step-1 gate; this plan's break table was NOT exhaustive and said so wrongly — the executor was right to stop.)**
  **What happens.** `scripts/generate.mjs:306` sorts the real index with `files.sort((a, b) => a.path.localeCompare(b.path))`, and `search()` returns hits grouped by file **in index order** (path-hit before content-hit *within* a file). `tests/` has always been indexed, so `grep.spec.ts`'s own source text is searchable content. While the spec lived at `tests/e2e/grep.spec.ts` it sorted **after** every `src/` path, so the real file always won `rows(page).first()`. Moved to `src/features/grep/tests/ui/e2e/grep.spec.ts` it sorts at **`g`** — **before** `src/features/repositories/…` at `r`. Verified against the regenerated index: the only two files matching the full query are `src/features/grep/tests/ui/e2e/grep.spec.ts` (**index 103**, content hit — the spec's own line 144/145 literals) and `src/features/repositories/components/Repositories.svelte` (**index 189**, path hit). The spec now out-ranks the file it is asserting about, so `rows(page).first()` returns the spec itself. Deterministic, both viewports, `grep.spec.ts:126`.
  **Why this is a D8 fix and not a forbidden spec rewrite.** The test's claim — *the first row is the real component and Enter navigates to the repositories view* — is preserved exactly; only the **encoding of the query string in the source** changes, so the spec stops polluting the index it queries. Ranking is load-bearing to the claim (Enter navigates the **selected** row), so weakening the assertion to `rowByPath(...).toBeVisible()` would gut the thing under test and is **rejected**. This is also **the file's own established idiom**: the very next test (line ~158) builds a run-time `nonceQuery` for precisely this reason, commenting "so it can never accidentally appear as text in the very index this suite's own source is walked into (`scripts/generate.mjs` indexes `tests/**`, including this file)." Applying that technique to a second query is not "normalizing a ported spec" under D23(a) — it is the D8 obligation to fix what this phase's own move invalidated.
  **Mechanics.** Introduce one const built so the full path never appears verbatim on any line, and use it for **both** the `type()` call and the assertion:
  ```ts
  const REPOSITORIES_PATH = ["src", "features", "repositories", "components", "Repositories.svelte"].join("/");
  ```
  **The rewritten comment block must not contain the `src/`-prefixed path verbatim either** — that would re-create the content hit and put the test straight back to red. (Today's block is safe only because its example, `../../features/repositories/…`, carries no `src/` prefix.) Rewrite the block to state the *current* constraint: the query is assembled at run time so this file's own source can never out-rank the file it asserts about. **Do NOT touch `generate.mjs`** — skipping or re-sorting the index to dodge this is a behavior change and is forbidden.
  **Not fixed, deliberately: the employment assertion at line ~109.** It types `role: "Software Developer, Co-op"` and asserts `.first()`, and the spec's own line is likewise a content hit — but `src/features/employment/…` (**index 78**) sorts before `src/features/grep/…` (**103**), so the real file still wins and the test passes deterministically. Verified against the regenerated index. This phase fixes what it **broke**, not every latent fragility it can see (D23(a); phase 09's "a phase fixes the instances it authors"). The ordering is stable for the rest of the migration — nothing left to move changes employment's or grep's rank relative to each other. **Record it in Results** as a known fragility for the hardening pass.
  **Carry to phase 11.** `shell.spec.ts` moves from `tests/e2e/` into `src/features/shell-fs/…` under the same alphabetical index and can hit this exact failure mode against any real path it queries. Its break table must be checked for rank shifts, not just stale literals, before it is declared exhaustive. Record this in Results so it reaches `00-phases.md` at close.

### Out-of-context literal-path breaks — the complete list

These name a moving path from outside the feature. Each is fixed **in the same change** as the move that invalidates it (D8). This list is **exhaustive** — produced by `grep -rn "components/grep-overlay\|lib/grep\|data/grep\.yaml\|fixtures/grep-index" src common tests scripts docs package.json`, excluding the vendored `reference/` dump.

| # | site | kind | fixed in |
|---|---|---|---|
| 1 | `tests/unit/grep.test.ts:8,11` + header line 1 | **the only real breakage, and it is invalidated by TWO different moves, so it is fixed in TWO commits (D8).** Line 8's `import … from "../../src/lib/grep"` breaks on **step 2**'s lib move (fails `pnpm check`); line 11's `readFileSync(join(ROOT, "fixtures/grep-index.json"))` and the `ROOT` depth break on **step 3**'s fixture move and the file's own relocation (fails as `ENOENT`). Line 38 is fixture data — **do not touch** (R4). | **line 8 + header line 1: step 2; `ROOT` + line 11 + line 4: step 3** |
| 2 | `tests/e2e/grep.spec.ts:83` | asserts `rowByPath(page, "src/lib/grep.ts")` — a **real-tree** path this phase moves; the row's `data-path` will change. Also its line-78 test title. Fails as a wrong assertion. | step 2 |
| 3 | `common/tests/ui/e2e/cmdline.spec.ts:25` | import specifier (R1). Fails `pnpm check`. | step 2 |
| 4 | `src/bootstrap/Terminal.svelte:54` | import specifier (R5). Fails `pnpm check`. | step 2 |
| 5 | `src/common/lib/data.ts:26` | `?raw` specifier (R2, R6). Fails the build. | step 3 |
| 6 | `package.json:11` | `build:fixtures` `cp` source (R4). Fails as a missing file at fixture-build time. | step 3 |
| 7 | `src/common/lib/views.ts:116` | comment citation of `fixtures/grep-index.json`. | step 3 |
| 8 | `common/tests/unit/views.test.ts:95` | comment citation of `fixtures/grep-index.json`. **Comment only** (R3). | step 3 |
| 9 | `src/common/lib/repo-tree.ts:49` | docstring example path `"src/lib" or "src/lib/grep.ts"`. Repoint the example to the new real path. | step 2 |
| 10 | `src/lib/shell.ts:69` | comment citing `src/lib/grep.ts`'s `RepoFile` (phase 11's tree; comment only). | step 2 |
| 11 | `src/components/grep-overlay/GrepOverlay.svelte:37` | in-context comment quoting the `cp fixtures/grep-index.json` clause. | step 3 |
| 12 | `tests/e2e/grep.spec.ts:10-11` | in-context header citing `src/lib/grep.ts` and `tests/unit/grep.test.ts`. | step 2 |
| 13 | `tests/e2e/grep.spec.ts:36-38` | in-context comment citing `src/components/GrepOverlay.svelte` — **already stale today** (the real file is `grep-overlay/GrepOverlay.svelte`); repoint to the new home. | step 2 |
| 14 | `grep.spec.ts:~128-145` | **not a stale path — an index-RANK break (R8).** The spec's own move changes where its source sorts in the real index, so its verbatim query literal out-ranks the file it asserts about. Fails as a wrong `data-path` on `rows(page).first()`. **No sweep pattern can find this**, because the invalidated assertion names no moved path. | **step 1** |

**This table was declared exhaustive on the strength of a path-citation sweep, and row 14 proves that claim was too strong** — a sweep for moved paths cannot see a break whose cause is a *rank shift* in a sorted index. When a step's gate goes red on something absent from this table, that is a plan defect: **stop and report**, as the executor correctly did. Do not improvise a spec-body fix.

After step 3, run this to prove none were missed:
```bash
grep -rn "components/grep-overlay\|lib/grep\|data/grep\.yaml\|fixtures/grep-index" src common tests scripts docs package.json \
  | grep -v "^src/features/grep" | grep -v "^common/tests/ui/support/reference/"
```
Every surviving hit must be an intentionally-updated line.

### Other verified facts

- **v1 drift: nothing is genuinely diverged.** `src/lib/grep.ts`, `src/data/grep.yaml` and `PreviewPanel.svelte` are **byte-identical** to the v1 working tree at `/Users/shev/Development/spidey-hub`. `GrepOverlay.svelte`, `grepOverlayState.svelte.ts` and `QueryListPanel.svelte` differ **only** by earlier phases' import rewrites (`../../lib/{views,data,layout}` → `../../common/lib/…`, plus the `pasteTargets`→`paste-targets` and `fileIcons`→`file-icons` renames). No behavior, markup or comment-body difference anywhere.
- **The component set has no cross-feature import.** Resolved specifier by specifier: everything reaches `src/common/lib/{views,data,layout,paste-targets,file-icons}`, a same-directory sibling, or `src/lib/grep.ts` (which becomes a feature sibling). **No `src/features/<other>/` import exists**, so this phase authors no R004 violation and needs no `agoLabel`-style extraction.
- **`GrepOverlay.svelte:107` exports `handleKey(e): boolean` and attaches no listener of its own** (`grep -n "svelte:window\|addEventListener"` over all four files → zero hits). Terminal owns the listener. Harness wrapper required (§Mechanics 5).
- **Recipe ownership: two recipes, four goldens, ONE array.** `09-grep-empty` (`recipes.ts:131`) and `10-grep-query` (lines 132–135) both live in the base `recipes` export (line 78), not `extraRecipes`/`iteration3Recipes` — so the feature's `identical.spec.ts` imports a **single** array, simpler than phase 09's two-array case. Copy the nearest single-array precedent (verify which of dashboard's or employment's `identical.spec.ts` imports only `recipes`, and model on that one). Goldens live only at `tests/visual/goldens/<vp>/{09-grep-empty,10-grep-query}.png`.
- **Post-phase-09 shared state** (this is what you are appending to): `SPLIT_OWNED_RECIPE_NAMES` holds **17** entries and gains two → **19**. `test:e2e`'s project list ends `--project=repositories-1512x945 --project=repositories-1920x1080`. `test:visual`'s path list ends with repositories' `identical.spec.ts` and `harness/repositories.spec.ts`. `src/pages/harness/[feature].astro` has `profile`, `help`, `boot`, `notifications`, `dashboard`, `employment`, `repositories` branches. Playwright emits **44** projects today; this phase adds **5** (2 + 2 + 1) → **49**. Goldens are distributed root 8 / common 10 / features 24 = **42**; after this phase root drops to **4** (2 recipes, `16-shell` + `17-host-shell`, both phase 11's) and grep gains **4** — total still 42.
- **Unit baseline: 348 passed / 22 files** (measured 2026-09-12). This phase **moves** one unit file and creates none, so the end state is **348 passed / 22 files — both numbers unchanged.** A changed count means something was lost or duplicated. Break #1 lives in that unit file, so a red `test:unit` here means a missed literal path, not a flaky suite.
- **E2E/visual baselines: D20(a) `pnpm test:e2e` → 1012 passed; D20(b) `pnpm test:visual` → 85 passed** (phase 09's closing numbers). This phase **relocates** specs and recipes between projects rather than adding any, so **D20(a) must still read 1012** and D20(b must read **85 + the new grep harness test count** — state that count explicitly rather than reporting a total that hides it. `legacy-<viewport>` (testDir `./tests/e2e`, config line 66) survives this phase holding only `shell.spec.ts`; it empties and is deleted in phase 11 (D6).
- **Carried-in flake observed during this phase's step 1 (2026-09-12):** `[common-1920x1080] nav.spec.ts:353` "status bar minute advances after 60s" failed once in a D20(a) run and **passed on an isolated re-run**. It is a *time-dependent* assertion (a 60-second wall-clock rollover), a different class from the `repositories.spec.ts` `dist`-staleness flake phase 09 root-caused and closed. This phase touches nothing in `common/`. **Logged, not cleared:** if it reproduces in the orchestrator's gate at the committed tree, root-cause it here rather than deferring again; if it does not, record it as observed-once for phase 11 to keep watching.
- **`GREP_ROOT_FILES` (`generate.mjs:284-290`) still lists `README.md`, which does not exist at the repo root.** Pre-existing, guarded by `existsSync` (line 301), silently skipped, and **not invalidated by anything this phase moves** — so it is **not** this phase's to fix under D8. Record it in Results for the hardening pass; do not touch `generate.mjs`.
- **`common/` is invisible to both index walkers** — `GREP_ROOT_SUBDIRS` (line 282) and `FS_INDEX_SUBDIRS` (line 347) never list it, and no skip-list mentions it, so `common/**` has been unsearchable via `/` since phase 02. Pre-existing, unrelated to grep's move, **out of scope**. Record it in Results for the hardening pass.

### Stale-comment debt (fix in the same change as the move that invalidates it)

Break-table rows 7–13 above, plus R7's four "relocation refactor" citations, plus `tests/unit/grep.test.ts:4`'s "Run via `pnpm test:unit` / `node --test`" — **`node --test` is not this repo's runner** (D3: Vitest), so that clause is misleading and goes (comments.md R003). **A repoint is not automatically a fix:** verify the new path exists on disk with `test -f` before writing it, and when rewriting a comment block re-read every path it mentions, not only the clause that motivated the edit.

## Mechanics (settled by phases 02–09; reuse verbatim, do not redesign — architecture R003)

**1. D21(a) snapshot paths.** The root `snapshotPathTemplate` stays `"tests/visual/goldens/{projectName}/{arg}{ext}"` (config line 33). Every split visual project carries its **own** template with the viewport as a **literal**, never `{projectName}`.

**2. Project naming.** A Playwright project is 1:1 with one `use` config, so each tier emits **two** entries via `viewports.map(...)`. **There is no bare alias and no glob** — `--project=grep` and `--project="*-visual"` both error. Always the two explicit flags.

**3. The three project entries this phase adds** to `playwright.config.ts`, appended after the `repositories-harness` entry (which ends at line ~438):

```ts
...viewports.map((viewport) => ({
  name: `grep-${viewport.name}`,
  testDir: "./src/features/grep/tests/ui/e2e",
  use: { ...devices["Desktop Chrome"], viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 },
})),
...viewports.map((viewport) => ({
  name: `grep-visual-${viewport.name}`,
  testDir: "./src/features/grep/tests/ui/visual",
  snapshotPathTemplate: `src/features/grep/tests/ui/visual/goldens/${viewport.name}/{arg}{ext}`,
  use: { ...devices["Desktop Chrome"], viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 },
})),
{
  name: "grep-harness",
  testDir: "./src/features/grep/tests/ui/harness",
  use: { ...devices["Desktop Chrome"], viewport: { width: viewports[0].width, height: viewports[0].height }, deviceScaleFactor: 1 },
},
```

**4. D24 harness route.** `src/pages/harness/[feature].astro` is one shared dynamic route gated by `if (process.env.PORTFOLIO_FIXTURES !== "1") return [];` in `getStaticPaths`. Add a `grep` entry to (a) the `getStaticPaths` array, (b) the prop-assembly lines — grep needs only `getGrep()` from `common/lib/data` (no `getCollection` call; R2), and (c) a conditional block mounting `GrepHarness`.

**5. Harness wrapper + hydration race — both required.** `GrepOverlay.svelte` exports `handleKey()` but attaches no listener, so the wrapper reproduces **only** that keydown→`handleKey()` routing, exactly as `RepositoriesHarness.svelte` and `NotificationsHarness.svelte` already do (`bind:this={ref}` + `<svelte:window onkeydown={(e) => ref?.handleKey(e)} />`), and documents the divergence in its header comment. The real mount also passes `onNavigate={core.switchToView}`; the harness has no router, so pass a no-op and say so in the header. Because the harness ships `client:load`, render an `onMount`-flipped element and wait on **that**:

```svelte
<div data-testid="grep-harness-ready" data-ready={ready}></div>
```

**Grep needs no `api.github.com` abort** — it makes no GitHub call (that was repositories'). It *does* `fetch("/generated/grep-index.json")` at runtime (`grepOverlayState.svelte.ts:14`), which the fixture build serves from the moved fixture via `build:fixtures`' `cp` — so the harness sees the frozen 24-entry index deterministically. **The overlay starts closed and opens on `/`** — the harness spec must press `/` before asserting anything about rows.

**5b. Harness assertions are web-first — do not copy the ported spec's reads.** Phase 05 lost a fix round to this. A verbatim-ported spec may read values non-retryingly because it races a live clock; a harness spec does not inherit that justification. Assert through the page object with `await expect(pageObject.x).toHaveText(...)` / `.toHaveAttribute(...)`. **`playwright.md` R002 bans CSS selectors unconditionally — that includes `document.querySelector` inside `page.evaluate()`.** The one sanctioned non-retrying read is deriving an *expected value* to feed a web-first assertion — never as the assertion itself.

**6. Page objects.** `src/features/grep/tests/ui/pages/GrepPage.ts`, a sibling of `e2e/`/`visual/`/`harness/`. A feature page object **may not** redefine kernel-chrome locators — compose the shared class, as `RepositoriesPage.ts:2` does:

```ts
import { StatusBarPage } from "../../../../../../common/tests/ui/pages/StatusBarPage";
```

Verify that relative depth with `node -e "…path.relative…"`; do not guess it.

**7. Locators.** `playwright.md` R002 bans CSS selectors unconditionally, even scoped off a resolved testid. If a repeated element needs narrowing, add a real `data-testid` to the markup (attribute-only, zero pixel change, goldens re-verified in the same change — D24's sanctioned mechanical edit). Any testid **authored** in this phase must carry the `grep-` prefix (files-and-naming R014); *ported* markup's testids are exempt under D23(e). Note the ported markup already uses `grep-*` testids, so no rename question arises.

**8. Per-commit index self-consistency (toolchain R012). EVERY commit in this phase regenerates and entry-diffs.** Steps 1, 2, 3 and 6 all add, move or delete files under `src/` or `tests/`, which both indexes walk (specs and goldens included). Run `pnpm generate` **last, after the final edit in each commit**, against that commit's own tree, and diff `public/generated/{grep-index,fs-index}.json` **programmatically by entries** — both are single-line JSON, so `git diff` alone is useless, **and both are inherently unstable across runs** because they record the size of network-sourced `contributions.json` (00-phases.md, Deferred). **`src/generated/file-icons.json` is NOT live drift** — it is deterministic and tree-derived; commit it with the indexes. Phases 07 and 08 each lost a commit to inferring that an unmentioned step needs no regeneration.

**9. Ordering that closed phase 09's carried flake: generate → build → test → revert live drift → commit. Revert always LAST.** Reverting live-data files (`public/generated/contributions.json`, `src/generated/commits/daily-tech-digest.json`) with `git checkout --` *before* the build produces a stale `dist/` and a spurious multi-failure run. This was root-caused in phase 09 and is not a flaky spec.

**10. Long gates auto-background past the 120s foreground default.** Watchdog kills happened in phases 06, 08 and 09; all landed on clean commit boundaries. **The full D20(a)/(b) gates at the final committed tree are the orchestrator's to run** — do not end a turn waiting on one. If a gate is killed, re-run it from the committed tree rather than guessing at partial output, and never report a number you did not see.

## Steps

- [x] **1. Port the e2e spec + the two recipes' four goldens; add the project entries.**
  `git mv tests/e2e/grep.spec.ts src/features/grep/tests/ui/e2e/grep.spec.ts`. Repoint its `fixtures` import (line 13) to `../../../../../../common/tests/ui/support/fixtures` — **extensionless** (D23(d)) — after verifying the depth with `path.relative`. Re-depth its `ROOT` constant (line 24; its target `public/generated/grep-index.json` stays at the repo root, so only the depth changes). **Re-depth — do not yet re-home — its `src/lib/grep` import (line 22), stripping the `.ts` extension**: grep.ts does not move until step 2, so at this step it must point at the still-real legacy path. Step 2 repoints it to the feature sibling. That two-step edit is deliberate, not a mistake; a forward-looking repoint here would fail this step's own `pnpm check`.
  Create `src/features/grep/tests/ui/visual/identical.spec.ts`, modeled on the nearest **single-array** feature precedent (verify which of dashboard's/employment's imports only `recipes`), filtering to a `GREP_OWNED_RECIPE_NAMES` set of exactly `09-grep-empty` and `10-grep-query`.
  `cp` all four goldens into `src/features/grep/tests/ui/visual/goldens/<vp>/`; `cmp` each against the pre-move copy **and** against v1's copy at `/Users/shev/Development/spidey-hub/tests/visual/goldens/`; only then delete the originals. Add both names to `tests/visual/identical.spec.ts`'s `SPLIT_OWNED_RECIPE_NAMES` (17 → 19) and update its header comment.
  Add the three project entries (§Mechanics 3); extend `package.json`'s `test:e2e` with the two `grep-*` project flags and `test:visual` with the new `identical.spec.ts` path **only** (the harness spec path is added in step 6 — Playwright exits 1 on a path that resolves to no tests). Sweep `docs/testing/{e2e,visual}/running-tests.md` in the same commit: both files' "**Not yet real** … (grep, shell-fs)" rows narrow to "(shell-fs)", and both status headers gain grep. **Verify every project name against real `playwright test --list` output before writing any row.**
  **Apply R8 — required by this step's own move, and this step's gate is what catches it.** Replace `grep.spec.ts`'s two verbatim `"src/features/repositories/components/Repositories.svelte"` literals (the `type()` call at ~144 and the `toHaveAttribute` at ~145) with a single run-time-assembled const, per R8's mechanics. Rewrite the comment block above them (~128–143) to state the current constraint — **without writing the `src/`-prefixed path verbatim anywhere in it**, which would re-create the content hit. In the same rewrite, **strip that block's plan/phase citation** ("since phase 02 (00-phases.md) moved several kernel components under `src/common/components/`"): comments.md **R008** bans a plan/phase reference **outright, whether or not the cited document exists**, and `Instructions/00-phases.md` does exist, so the step-7 sweep's existence test would wrongly clear it. Keep the constraint (every indexed path begins with `src/`, because kernel components live under `src/common/components/`); delete the account of how that came to be true. **Comment and query-encoding only — the test's actions, its Enter/navigation assertions and every other line stay untouched (D23(a)).**
  `pnpm generate` last; diff both indexes by entries. **Then re-check the rank directly**, rather than inferring it from a green run:
  ```bash
  node -e "const i=require('./public/generated/grep-index.json');const q='src/features/repositories/components/Repositories.svelte';console.log(i.map((f,n)=>({n,p:f.path,hit:f.path.includes(q)||f.lines.some(l=>l.includes(q))})).filter(h=>h.hit))"
  ```
  Exactly **one** file must match — the real component. If `grep.spec.ts` still appears, the literal survived somewhere in the file (most likely the rewritten comment).
  *Verify:* `pnpm check` → 0 errors. `pnpm build`, then the full D20(a) project list **plus** `--project=grep-1512x945 --project=grep-1920x1080` → all green, **1012 total**. Then `pnpm build:fixtures` and the `test:visual` list including the new `identical.spec.ts` → all green, **85 total**. `playwright test --list` names all three new projects and reports **49** projects.

- [x] **2. Move the components and the lib; repoint every consumer; delete the legacy directory.**
  `git mv` all four files from `src/components/grep-overlay/` into `src/features/grep/components/`, and `src/lib/grep.ts` → `src/features/grep/lib/grep.ts` (**R1 — feature-owned, no kebab rename needed: the name is already one word**).
  Repoint each component's own `../../common/...` imports to their new depths (`../../../common/...`, matching every prior feature), and `grepOverlayState.svelte.ts:10`'s `../../lib/grep` → `../lib/grep`.
  Repoint the three external importers, **path only**: `src/bootstrap/Terminal.svelte:54` (R5), `common/tests/ui/e2e/cmdline.spec.ts:25` (R1, D23(c)), and the spec's own line-22 import from step 1's interim legacy path to `../../../lib/grep`.
  **Fix, in this same change, the literals this move invalidates (D8):** break #2 (`grep.spec.ts:83`'s `rowByPath(page, "src/lib/grep.ts")` **and** its line-78 test title) and break-table rows 9, 10, 12, 13 (`repo-tree.ts:49`, `shell.ts:69`, and the spec's own two header/comment citations). **`grep.spec.ts:83` must be fixed here, not deferred** — `src/lib/grep.ts` is in the real grep index, so regenerating without the fix goes red, and not regenerating commits an index stale against its own tree.
  **Also fix break #1's first half here:** `tests/unit/grep.test.ts:8`'s import → `../../src/features/grep/lib/grep` and its line-1 header citation. **The file itself stays in `tests/unit/` until step 3** — repointing it now means step 3's move inherits a correct import, exactly as phase 09's `agoLabel` ordering did. Without this, step 2's own `pnpm check` and `pnpm test:unit` gates go red.
  (`grep.spec.ts`'s R008 phase citation and its R8 query fix both landed in **step 1**, in the same comment block — nothing further is owed here.)
  Apply **R7**: strip the four "relocation refactor" provenance citations. Comment text only.
  `pnpm generate` **last**; diff both indexes by entries.
  *Verify:* `test ! -d src/components/grep-overlay && test ! -e src/lib/grep.ts`; `ls src/components` shows only `Shell.svelte`; `ls src/lib` shows only `shell.ts` and `shellIndex.ts`. **`pnpm check` → 0 errors** — the gate that proves every repoint resolves. `pnpm test:unit` → **348 / 22** (grep.test.ts still reads the un-moved fixture at this step, so it must stay green). Real build → D20(a) list + both `grep-*` projects green at **1012**; this is the gate that proves break #2 landed against the regenerated index.

- [x] **3. Move the yaml and the fixture index; fix the remaining build and literal-path breaks.**
  `git mv src/data/grep.yaml src/features/grep/content/grep.yaml` and `git mv fixtures/grep-index.json src/features/grep/tests/ui/support/grep-index.json` (**R4 — the file's bytes are frozen; move it, change nothing inside it**). `git mv tests/unit/grep.test.ts src/features/grep/tests/unit/grep.test.ts`.
  Fix, **all in this same change**: **break #1** (`grep.test.ts`'s `ROOT` depth — verify with `path.relative`, do not guess — its line-11 fixture path, its line-1 header citation, and its line-4 stale `node --test` clause; **line 38 is fixture data and stays exactly as it is**); **break #5** (`data.ts:26`'s `?raw` specifier + R6's header narrowing); **break #6** (`package.json`'s one `build:fixtures` `cp` **source**, destination unchanged); **breaks #7, #8, #11** (the three `fixtures/grep-index.json` comment citations in `views.ts:116`, `views.test.ts:95` and `GrepOverlay.svelte:37`).
  `pnpm generate` **last**; diff both indexes by entries — expect the fixture file to appear as a new `src/features/grep/tests/ui/support/grep-index.json` entry and to route `null`.
  *Verify:*
  ```bash
  test ! -e src/data/grep.yaml && test ! -e fixtures/grep-index.json && test ! -e tests/unit/grep.test.ts
  ls src/data      # must list only shell.yaml
  ls fixtures      # must list only fs-index.json
  ```
  Then the exhaustive sweep from §Background — every surviving hit must be an intentionally-updated line. **`pnpm check` → 0 errors.** `pnpm test:unit` → **348 / 22** (proves break #1 and, via `views.test.ts` against the regenerated index, proves R3: every new grep path still routes `null`). Fixture build → `pnpm test:visual` green at **85** (proves break #6 — a wrong `cp` source makes the overlay fetch a 404 and both grep goldens diverge).

- [ ] **4. Full gate, from the clean committed tree.** Not folded into any prior commit. **Orchestrator-run (§Mechanics 10).**
  *Verify:* `pnpm check` → 0 errors. `pnpm lint` → exit 0. `pnpm test:unit` → 348 / 22. D20(a) real build → `smoke`, `legacy-*`, `common-*`, and every feature project including `grep-*` green at **1012**. D20(b) fixture build → every `*-visual` + legacy visual + both adversarial halves + the **seven existing** harness specs green at **85** (grep's own harness lands in step 6 and is gated there). `node scripts/generate.mjs` completes with all five artifact kinds and throws nothing. `public/generated/*` unchanged by this step (index self-consistency, toolchain R012).

- [x] **5. Golden parity — zero churn.**
  *Verify:* `diff -rq tests/visual/goldens /Users/shev/Development/spidey-hub/tests/visual/goldens` shows **only** `Only in …` lines for every recipe split out by phases 02–10 — never a `differ` line. `cmp` each of this phase's four goldens against v1's byte-for-byte. Repo-wide total stays 21 recipes × 2 viewports = **42** PNGs: root **4** (2 recipes: `16-shell`, `17-host-shell`), common 10, grep 4, other features 24. **No `--update-snapshots`, ever (D5).**

- [x] **6. Feature harness (D24).**
  Add the `grep` branch to `src/pages/harness/[feature].astro` (§Mechanics 4 — `getGrep()` only, no collection), build `GrepHarness.svelte` with the keydown→`handleKey()` routing, the no-op `onNavigate` and its documenting header comment (§Mechanics 5), the ready-element, a `GrepPage` page object (§Mechanics 6), and specs at `src/features/grep/tests/ui/harness/grep.spec.ts` asserting mount plus the feature's core interactions: `/` opens the overlay, the empty query lists the fixture index's rows, typing a query filters them and updates the counter, arrow/`gg`-`G` navigation moves the selection, the preview pane renders the selected row's lines, and Escape closes. **Derive expected counts from the fixture file rather than hardcoding 24** — and note the overlay renders only as many rows as the list pane's measured height allows (`listVis`), so assert a lower bound or the counter text, never a rendered-row equality. Assert kernel-free isolation via the composed `StatusBarPage`: `expect(page.statusBar.windows).toHaveCount(0)`.
  Now that the spec exists, append its path to `package.json`'s `test:visual`.
  *Verify:* fixture build → `--project=grep-harness` green, and `pnpm test:visual` green as a whole at **85 + <new grep harness test count>** — state that count explicitly. Real build → `test ! -d dist/harness` **and** `grep -rl "grep-harness-ready" dist --include="*.html"` empty. Use the harness-only ready-marker for that grep, **never** a bare component name — real pages legitimately contain grep markup. A bare `find dist -iname "*harness*"` will still match dead ~1 KB JS chunks from earlier phases — expected and pre-ruled harmless.

- [x] **7. Record and close.**
  Run **all three** citation sweeps over this phase's own context:
  ```bash
  grep -rniE "plan\.md|phase [0-9]|defect [0-9]|decision [0-9]|iteration [0-9]|\b[fg][0-9]+\b" src/features/grep
  grep -rniE "\b(the )?(audit|cleanup|criterion|rebuild|rewrite|refactor|mockup|prototype|spec) ('s)?\b" src/features/grep
  grep -rnoE "(src|tests|common|Instructions|docs)/[A-Za-z0-9_./-]+|[A-Za-z0-9_-]+\.(md|dc\.html|mjs|ts)" src/features/grep
  ```
  The third's output must be checked **path by path against the real filesystem**. **Two known false positives must be left alone and named in Results:** (a) `tests/unit/grep.test.ts:38`'s `"src/lib/grep.ts"` and every path inside `tests/ui/support/grep-index.json` — **fixture data, not citations** (R4); (b) `Homepage.dc.html` references, which resolve to the real `common/tests/ui/support/reference/Homepage.dc.html`. The second grep is deliberately over-broad and returns mostly legitimate prose — read every hit, and **additionally hand-check the four R7 files**, since that regex structurally cannot match "refactor." followed by a period. Judgment rule: a reference to a **process artifact that does not exist in this repository** is the violation; a reference naming a **current constraint the code implements** is not. **One clarification this phase adds, because the existence test alone gives the wrong answer:** a citation of a **plan document, phase, iteration or numbered decision is a violation even when the document exists** — comments.md R008 bans the reference class outright, and `Instructions/00-phases.md` is exactly such a document (see step 2's `grep.spec.ts:~134` fix). Existence clears a *stale-path* concern (R003), never an R008 one. **Comment text only; a ported spec's logic and assertions are untouchable.**
  Run the cross-feature edge scan **by resolving each relative specifier against the filesystem, never by substring-matching `features/`** (00-phases.md's phase-09 detection note): confirm `src/features/grep` imports no other feature. The known repo-wide count going in is **2** (notifications' pre-existing `boot-state` pair, deferred); it must still be 2 afterwards.
  Then fill in Results: every file moved, every importer updated, every break and how each was verified fixed, the D23 edges flagged for the auditor, gate outputs with real numbers, the harness shape used, the final golden distribution, and the two hardening-pass items this phase recorded but did not fix (`GREP_ROOT_FILES`' dead `README.md`; `common/` invisible to both index walkers). Commit to `frontend-rewrite` — single-line imperative, **no body, no trailer** (toolchain R011), one reviewable unit per commit (R012).

## Acceptance criteria

1. Every file in the move table is at its new path; `src/components/grep-overlay/`, `src/lib/grep.ts`, `src/data/grep.yaml`, `fixtures/grep-index.json`, `tests/e2e/grep.spec.ts` and `tests/unit/grep.test.ts` no longer exist. `src/components/` holds only `Shell.svelte`; `src/lib/` only `shell.ts` + `shellIndex.ts`; `src/data/` only `shell.yaml`; `fixtures/` only `fs-index.json`; `tests/e2e/` only `shell.spec.ts`.
2. `grep.ts` is at `src/features/grep/lib/grep.ts` — **not** in `common/lib/` (R1) — and `cmdline.spec.ts`'s one import resolves to it, recorded as D23(c).
3. `src/content.config.ts` and `scripts/generate.mjs` are **byte-unchanged** by this phase (R2; §Context).
4. `views.ts`'s `grepPathToView()` and `views.test.ts`'s `expectedView()` have **zero code/literal edits**, and `views.test.ts` passes against the regenerated real index — proving every new grep path still routes `null` (R3).
5. `fixtures/grep-index.json`'s **content is byte-identical** at its new home (`cmp` against the pre-move copy), and `tests/unit/grep.test.ts:38`'s fixture-data literal is unchanged (R4).
6. All **fourteen** break-table rows are fixed and proven by a green `pnpm test:unit` (348 / 22), a green real-build `legacy-*` + `grep-*` run, and a green fixture build. Row 14 (R8) additionally proven by the index-rank check: exactly one file matches the `Repositories.svelte` query, and `grep.spec.ts:126` passes at both viewports.
7. `build:fixtures`' `cp` **source** repointed with the `dist/generated/` destination unchanged; the `fs-index.json` clause untouched (R4).
8. `pnpm check` 0 errors, `pnpm lint` exit 0, `pnpm test:unit` **348 passed / 22 files**.
9. D20 both invocations green: (a) **1012** including `grep-{1512x945,1920x1080}`; (b) **85 + the new grep harness count**, including `grep-visual-*` and `grep-harness`. Playwright reports **49** projects.
10. Zero golden churn; **42** PNGs repo-wide (root 4 / common 10 / grep 4 / others 24); both grep recipes byte-identical to v1 at both viewports.
11. Real build emits no `dist/harness/` directory and no HTML page referencing `grep-harness-ready`; `GrepPage.ts` exists and composes `StatusBarPage`.
12. All three citation sweeps clean over `src/features/grep`, with the two known fixture-data false positives named rather than "fixed"; the four R7 files hand-checked.
13. Cross-feature edge scan (path-resolving) shows `src/features/grep` importing no other feature; the repo-wide count is still **2**.
14. Verifier PASS **and** auditor clean on `src/features/grep` (D23 exemptions recorded with the exemption named).
15. Results filled in; no `(executor fills in)` placeholder.

## Stop conditions

- **No behavior changes.** No scoring, search, ranking, row-cap, ellipsis-math, preview or keyboard-model edits. If a spec goes red on *logic*, the move is wrong, not the spec. **This does not forbid D8 path updates** — repointing an import or a literal filesystem path a move invalidated is required. The line is behavior vs. location.
- **No fixture-content changes.** `grep-index.json`'s 24 entries are frozen (R4). Changing them is a golden rebaseline, which D5 reserves for a deliberate pass. If you believe an entry must change, **stop and report** — that is the stub's explicit "report to orchestrator, do not absorb" clause.
- **No promoting `grep.ts` to `common/lib/`** (R1, settled).
- **No `views.ts` / `views.test.ts` logic or literal edits** (R3). Comments only. Adding an `expectedView()` line is a stop-and-report.
- **No `content.config.ts` and no `generate.mjs` edits** — including the tempting `GREP_ROOT_FILES` `README.md` prune and the `common/`-not-indexed gap. Both are recorded for the hardening pass, not fixed here.
- **No rewriting moved code** — `grepOverlayState.svelte.ts` and `grep.ts` are verbatim-relocated and covered by **D23(e)** as generalized by 00-phases.md's phase-06 and phase-09 rulings (any verbatim-relocated class or module): classes.md encapsulation/ordering/`handleKey` shape, files-and-naming R011 module-scope helpers, svelte.md R002 `$state` vs `$state.raw`. **Do not "fix" any of them.** Record in Results **only the findings that actually exist** — phase 09 was dinged for pre-declaring an exemption that never triggered. Code *authored* this phase is never covered.
- **No normalizing the ported specs** (D23(a)) and no extracting shared helpers out of them.
- **No golden regeneration**, no `--update-snapshots`.
- **No behavioral edits outside the context** — path and comment updates only.
- **Do not touch** `repos/`, `src/generated/`, `public/generated/`, `vitest.config.ts`, `tests/unit/{freePort,keyframes-dedup}.test.ts`, or any phase-11 file beyond `shell.ts:69`'s comment. If you believe one needs editing, **stop and report**.
- If a step turns out to rest on a false assumption, **stop and report** rather than redesigning; the orchestrator updates this plan.

## Results

**Steps 2–7 executed and committed** (step 1 was already done/committed as `f3dc217` before this run). Commits, in order: `4db07d1` (step 2 — move components+lib, repoint consumers), `5bc646e` (step 3 — move yaml+fixture, fix remaining breaks), `5a566c5` (step 6 — harness route/wrapper/page-object/spec), `0dfc5f3` (step 7 sweep fix — stale v1 decision citation in the ported spec), and this Results commit (step 7 close). Step 4 (full D20(a)/(b) gate) is **left to the orchestrator**, per §Mechanics 10 and the orchestrator's own opening instructions; scoped equivalents were run and are recorded below.

**Step 5 (golden parity) required no commit** — filesystem checks only, all clean (see below).

### Files moved (move table, realized)

All ten rows of the move table are done: `src/components/grep-overlay/{GrepOverlay,QueryListPanel,PreviewPanel}.svelte` + `grepOverlayState.svelte.ts` → `src/features/grep/components/`; `src/lib/grep.ts` → `src/features/grep/lib/grep.ts`; `src/data/grep.yaml` → `src/features/grep/content/grep.yaml`; `fixtures/grep-index.json` → `src/features/grep/tests/ui/support/grep-index.json` (byte-identical, verified by `cmp` against the pre-move blob at commit `8374160`); `tests/e2e/grep.spec.ts` → `src/features/grep/tests/ui/e2e/grep.spec.ts` (step 1); `tests/unit/grep.test.ts` → `src/features/grep/tests/unit/grep.test.ts`; the four goldens → `src/features/grep/tests/ui/visual/goldens/<vp>/` (step 1). `src/components/grep-overlay/` is deleted. Post-phase state verified: `src/components/` holds only `Shell.svelte`; `src/lib/` holds only `shell.ts`+`shellIndex.ts`; `src/data/` holds only `shell.yaml`; `fixtures/` holds only `fs-index.json`; `tests/e2e/` holds only `shell.spec.ts`; `tests/unit/` no longer has `grep.test.ts`.

### Break-table — all 14 rows resolved (with two corrections)

Rows 1–12 fixed exactly as specified, verified by `path.relative`/`test -f` before every repoint:
- **Row 1** (`grep.test.ts`'s import/header/`ROOT`/fixture-path/stale-runner-clause): line 8 import + header line 1 fixed in step 2 (ahead of the file's own step-3 move, mirroring the plan's own two-step idiom); `ROOT`, the fixture path, and the `node --test` clause fixed in step 3. Line 38's `["src/lib/grep.ts", 0]` left untouched (R4).
- **Row 2** (`grep.spec.ts:83`'s `rowByPath("src/lib/grep.ts")` + line-78 title): fixed in step 2 to `src/features/grep/lib/grep.ts`.
- **Row 3** (`cmdline.spec.ts:25` import): fixed in step 2 → `../../../../src/features/grep/lib/grep`. **This is the D23(c) edge** — a common→feature test import whose direction pre-existed the move (R1); no shim, no `fixtures.ts` re-export, per R1's explicit instruction not to launder it through R11's trick.
- **Row 4** (`Terminal.svelte:54`): fixed in step 2 → `../features/grep/components/GrepOverlay.svelte`. Bootstrap→feature is the sanctioned D10 wiring direction; no exemption needed (R5).
- **Row 5** (`data.ts:26` `?raw` specifier + R6 header narrowing): fixed in step 3.
- **Row 6** (`package.json`'s `build:fixtures` `cp` source): fixed in step 3; destination (`dist/generated/grep-index.json`) and the `fs-index.json` clause beside it untouched.
- **Rows 7, 8, 11** (`views.ts:116`, `views.test.ts:95`, `GrepOverlay.svelte:37` — all `fixtures/grep-index.json` comment citations): fixed in step 3.
- **Row 9** (`repo-tree.ts:49` docstring example): fixed in step 2.
- **Row 10** (`shell.ts:69` comment): fixed in step 2.
- **Row 12** (`grep.spec.ts`'s header citing both `src/lib/grep.ts` and `tests/unit/grep.test.ts`): **split across two commits, mirroring row 1's own precedent** — the `src/lib/grep.ts` half fixed in step 2 (that move invalidated it); the `tests/unit/grep.test.ts` half fixed in step 3 (that move invalidated it). Both verified with `test -f` before writing.
- **Row 13**: **misattributed in the plan — no edit made, and none was correct.** The plan names the site as `tests/e2e/grep.spec.ts:36-38`, but no such comment exists there (checked against both the current file and the pre-step-1 blob at `8374160`). The actual string `"src/components/GrepOverlay.svelte"` occurs only in `Instructions/10-grep/PLAN.md` (this citation) and in `tests/unit/grep.test.ts:36-37` (now `src/features/grep/tests/unit/grep.test.ts:36-37`) — which is **R4-frozen fixture-content data**, the same class as line 38's protected literal, not a repointable citation. Repointing it would assert a path the frozen fixture doesn't contain and turn the suite red — exactly the mistake R4 calls out by name. Zero edits made; the orchestrator should correct this row when the plan is next touched.
- **Row 14 (R8)**: applied in step 1 (already verified and committed before this run). Re-confirmed here: the index-rank check returns exactly one match for the `Repositories.svelte` query, `grep.spec.ts:126` passes at both viewports, and the run-time-assembled `REPOSITORIES_PATH` const plus its rewritten comment block never spell the `src/`-prefixed path verbatim.

### Additional fix found by step 7's own sweep (not in the break table)

`grep.spec.ts` (ported e2e spec) carried a stale v1 process citation — `// ... (Decision 7, PLAN.md — dropped along with drill-down/../ in the v2 rebuild).` — a reference to a v1 decision log that doesn't exist in this repo (comments.md R008). This is comment-only text between two tests (no test logic touched), same class as phase 07/08/09's own citation-sweep fixes inside ported specs. Fixed in commit `0dfc5f3`; the surrounding "why this coverage doesn't exist" explanation was kept, only the specific decision/document citation was stripped.

### R7 (relocation-refactor citation strip)

All three named files fixed in step 2: `grepOverlayState.svelte.ts:1-8`, `QueryListPanel.svelte:1-4`, `PreviewPanel.svelte:1-4`. `GrepOverlay.svelte`'s header was checked and does **not** carry the same phrasing (verified, no edit needed — matches the plan's own "if it carries the same phrasing" hedge). **One disclosure beyond the plan's literal two-sentence pattern:** in `grepOverlayState.svelte.ts` I also removed a third sentence — "every `$state`/`$derived`/`$effect` here (and its accompanying comment) is moved verbatim from the original monolith — no reactivity, timing, or behavior change" — since it names process history ("the original monolith") rather than a current constraint, fitting R7's stated rationale even though it wasn't one of the two sentences the plan quoted verbatim. Comment text only; no markup/testid/class/style touched anywhere.

### R2/R3/R4/R6 verification

- **R2**: `src/content.config.ts` never opened (verified: `git diff` shows zero changes to it across all of this phase's commits). Grep's yaml moved as a plain `?raw` file; no `getCollection` call added anywhere, including the harness route.
- **R3**: `views.ts`'s `grepPathToView()` and `views.test.ts`'s `expectedView()` — zero code/literal edits, comment-only citations updated. Proven by `pnpm test:unit` staying green (348/22) after each move: `views.test.ts`'s first two tests assert every new grep path (including the newly-real-indexed fixture file) still routes to `null` against the regenerated real index.
- **R4**: fixture bytes verified byte-identical via `cmp` against the `8374160` blob after the move. `grep.test.ts:36-38`'s three fixture-content literals (`"src/components/GrepOverlay.svelte"` ×2, `"src/lib/grep.ts"`) left completely untouched.
- **R6**: `data.ts`'s header narrowed ("only `shell.yaml` still lives in `src/data/`"); line 14's still-accurate bundling-rationale mention of `src/data/` left alone; whole comment block re-read for other staleness (none found).

### Harness (step 6, D24)

Shape: `src/pages/harness/[feature].astro` gained a `grep` branch (`getGrep()` only, no `getCollection` — R2 means no fixture-switch ternary needed). `GrepHarness.svelte` wraps `GrepOverlay.svelte`, reproducing only the keydown→`handleKey()` routing Terminal.svelte normally owns (`bind:this` + `<svelte:window onkeydown>`), passes a no-op `onNavigate` (documented in its header — the real mount wires `core.switchToView`, which a kernel-free harness has no equivalent of), and exposes `data-testid="grep-harness-ready"` flipped by `onMount`. `GrepPage.ts` (`src/features/grep/tests/ui/pages/`) composes `StatusBarPage` (`../../../../../../common/tests/ui/pages/StatusBarPage`, depth verified) rather than redefining kernel-chrome locators, matching the `RepositoriesPage.ts` precedent exactly. The harness spec (`src/features/grep/tests/ui/harness/grep.spec.ts`, 7 tests) covers: `/` opens the overlay (nothing renders before that — `toHaveCount(0)`), the empty-query counter and a ≥4-row floor (asserted via `rows.nth(3)`, never an exact-count equality — Mechanics 6), typing a query filtering results + updating the counter, arrow-key navigation moving the selection, the preview pane rendering the selected hit's actual line text, Escape closing, and kernel-free isolation (`statusBar.windows` count 0). Every expected count/text is derived at runtime from the real fixture file plus the real `search`/`formatCount` functions (same convention as the ported e2e spec and `repositories.spec.ts`'s own harness) — nothing hardcoded.

**Plan-text correction found while writing this spec:** step 6's own text says to test "arrow/`gg`-`G` navigation," but grep's real, pinned behavior is that `g`/`G` are typed into the query as literal characters, never a jump — this is explicitly asserted by the ported e2e spec's own test "g and G are typed into the query like any other character (no jump)" (`grep.spec.ts:199`). Implementing a `gg`/`G` jump assertion would test behavior the component doesn't have, which the phase's stop conditions forbid inventing. The harness spec therefore exercises **arrow-key navigation only**; this is a plan-text inaccuracy, not a code defect, flagged the same way row 13 was.

**Mechanics-section citations kept, not stripped:** the harness spec's header and one inline comment cite "(Mechanics 5b, ...)" and "(Mechanics 6)" — this looks at first glance like the plan/phase citation class R008 (and this phase's own step-2 fix) forbids. It was kept deliberately: `src/features/repositories/tests/ui/harness/repositories.spec.ts:33` and `src/features/employment/tests/ui/harness/employment.spec.ts:23` already carry the **identical phrase** in code that passed phases 08's and 09's audits clean. Stripping only grep's instance would be inconsistent with standing, already-audited precedent across two closed phases; if the auditor now rules the pattern class itself a violation, all three sites (repositories, employment, grep) need the same fix together, not grep alone.

**Real-build verification**: `test ! -d dist/harness` — true. `grep -rl "grep-harness-ready" dist --include="*.html"` — empty. `find dist -iname "*harness*"` shows the expected dead ~1KB per-feature JS chunks (`GrepHarness.<hash>.js`, 571 bytes, alongside the five other features' equivalents) — the pre-ruled-harmless pattern from 00-phases.md's Deferred list (env-gated island, no route, no fixture data ships in a real build). No new ruling needed.

### D23 edges flagged for the auditor

- **D23(c)**: `common/tests/ui/e2e/cmdline.spec.ts:25` → `src/features/grep/lib/grep` (common→feature test import, direction pre-existed the move, per R1).
- **D23(e)** (verbatim-relocated code): `grepOverlayState.svelte.ts` and `grep.ts` are verbatim-relocated apart from the mandated import-path and comment-citation edits recorded above. **No exemption is pre-declared here** — a diff check shows no classes.md/svelte.md-shape findings surfaced during this phase's own work (unlike phase 09's `highlight.ts`/`repositoriesState.svelte.ts`); if the auditor finds one, it falls under the phase-09 generalization (any verbatim-relocated class/module), not a new ruling.

### Gate numbers (real, observed this session)

- `pnpm check`: **0 errors** (checked after every commit; 4 separate clean runs across the phase).
- `pnpm lint`: **exit 0** (checked at steps 2, 6, and after the step-7 sweep fix).
- `pnpm test:unit`: **348 passed / 22 files** — unchanged at every checkpoint (after step 2, step 3, step 6, and the final tree).
- D20(a) real build + full project list including both `grep-*`: **1012 passed, exit 0** — confirmed at `--workers=4` after step 2's build (one contention failure at default workers, `repositories.spec.ts:223`, passed in isolation and the `--workers=4` re-run was clean).
- D20(b) fixture build: **85 passed** at step 3 (before the harness existed). At step 6, **92 = 85 + the 7 new `grep-harness` tests**: the full 92-test list was **not** clean at default parallelism on either of its first two attempts (1st: 89 passed, 3 failed — `16-shell` ×2 viewports + `06-editor`; 2nd: 91 passed, 1 failed — `17-host-shell`); the **3rd full attempt, at `--workers=4`, passed 92/92 clean** — see flake log below for the isolation proof on each failing site.
- Final-tree scoped re-check (after the step-7 sweep commit `0dfc5f3`, comment-only): `grep-1512x945`+`grep-1920x1080` → **38 passed**; `grep-visual-1512x945`+`grep-visual-1920x1080`+`grep-harness` → **11 passed** (after one contention incident — see below).
- `playwright test --list`: **49 distinct projects**, all five `grep-*` present (`grep-1512x945`, `grep-1920x1080`, `grep-harness`, `grep-visual-1512x945`, `grep-visual-1920x1080`).
- Index entry-diffs: every commit's `pnpm generate` was diffed by entries against the prior commit's index. Step 2: 257→257 (5 renamed paths swapped 1:1). Step 3: 257→258 (the fixture file itself newly enters the real index under `src/`, as R4 predicted, routing `null`). Step 6: 258→261 (3 new harness files added). Step 7's comment-only commit: 261→261, zero added/removed (only line-content of the one edited file changed). `fs-index.json` tracked the same moves, net 664→667 (fixture-yaml-testfile net +3, since `fixtures/grep-index.json` also drops out of the `fixtures/`-rooted walk). `src/generated/file-icons.json`: **unchanged (byte-identical)** after steps 2 and 6; in **step 3** its content was semantically identical but its JSON key **insertion order shifted** (the `"grep.test.ts"` exactName key, already present pre-move since `generate.mjs` walks `tests/`, moved position because the file's walk location changed) — committed as legitimate, deterministic, tree-derived churn per §Mechanics 8, not live drift. Live-drift files (`contributions.json`, `daily-tech-digest.json`) reverted **last**, after every generate/build/test cycle, per §Mechanics 9's ordering, in every commit.
- Full D20(a)/(b) at the final committed tree is **left to the orchestrator** (§Mechanics 10; explicit in the orchestrator's own opening instructions) — the numbers above are this session's own scoped equivalents at each commit boundary, not a substitute for that final run.

### Golden parity (step 5)

`diff -rq tests/visual/goldens /Users/shev/Development/spidey-hub/tests/visual/goldens` → every line is `Only in <v1 path>`, zero `differ` lines. All four grep goldens (`09-grep-empty`, `10-grep-query` × 2 viewports) verified byte-identical to v1 via `cmp`, both before and again after the step-7 sweep commit. Final distribution: root **4** (`16-shell`, `17-host-shell` × 2 viewports — phase 11's), common **10**, grep **4**, other features **24** — total **42**, matching the plan exactly.

### Flake log (host-load contention, this machine; load average ~18 per the orchestrator's own note)

Every entry below was proven, not assumed: each failing spec was re-run in isolation and passed, then the full list it came from was re-run clean (at `--workers=4` or default parallelism, as noted).

1. **`repositories.spec.ts:223`** ("all-projects lists all 8 real project .md files") — single failure during step 2's default-worker D20(a) run (empty-array shape, a data-loading race under load). Passed in isolation; `--workers=4` re-run of the full 1012-test list was clean. New site, not one of the three the orchestrator's brief named (`nav.spec.ts:353`, `repositories-status-dots.spec.ts:37`, `boot.spec.ts:176`).
2. **`common/tests/ui/visual/identical.spec.ts` "06-editor"** — failed once during step 6's first `test:visual` run (`expected URL matching /\/employment$/ but got "/"` — a navigation race). Passed in isolation.
3. **`tests/visual/identical.spec.ts` "16-shell"** (×2 viewports) — failed on the same run as #2 (small pixel-count diffs, ~0.02 ratio). Passed in isolation.
4. **`tests/visual/identical.spec.ts` "17-host-shell"** — failed on the **second** `test:visual` re-run (after #2/#3 had already cleared) — a different single site each time is itself further evidence of contention rather than a real regression. Passed in isolation; the third full run, at `--workers=4`, was clean at 92/92.
5. **Inside grep's own context — proven, not written off:** after the step-7 sweep commit (`0dfc5f3`, comment-text only), the first post-`build:fixtures` run of `grep-visual-1512x945`/`grep-visual-1920x1080`/`grep-harness` together showed **3 failures** (`09-grep-empty` ×2 viewports, `10-grep-query` ×1). Proof chain run before concluding anything, per the explicit "never write off a failure inside `src/features/grep`" instruction: (a) each failing target passed individually in isolation; (b) all 11 tests passed together at `--workers=1`; (c) all 11 passed again at default parallelism; (d) all four goldens re-`cmp`'d byte-identical to v1 after the incident. The triggering commit changed only comment text in `grep.spec.ts` (entry-diff showed zero index entries added/removed). Conclusion: screenshot-capture-step contention under host load, not a golden regression — but this is exactly the kind of finding the orchestrator's own final D20(b) run at the committed tree should treat as the authoritative check, not this session's re-runs.
6. **Carried from step 1** (already logged in the plan before this session): `nav.spec.ts:353` observed once, not reproduced here — nothing in steps 2–7 touches `common/`'s clock code.

### Recorded-not-fixed hardening items (per the phase's own instructions — record, don't fix)

- **`GREP_ROOT_FILES` still lists `README.md`**, which doesn't exist at the repo root (`generate.mjs:284-290`, guarded by `existsSync`, silently skipped). Pre-existing, not invalidated by this phase's moves. Left for the hardening pass.
- **`common/` is invisible to both index walkers** (`GREP_ROOT_SUBDIRS`/`FS_INDEX_SUBDIRS` never list it). Pre-existing since phase 02, unrelated to grep's move. Left for the hardening pass.

### Employment-assertion fragility (deliberately left, per R8)

`grep.spec.ts`'s employment-role assertion (types `role: "Software Developer, Co-op"`, asserts `.first()`) is a content hit inside this same spec file, exactly the shape R8 fixed for the `Repositories.svelte` query — but `src/features/employment/…`'s real file sorts at index **78**, ahead of this spec's own new home at index **103**, so the real file still wins deterministically today. Not fixed here per D23(a) ("a phase fixes the instances it authors," and this ordering was never broken by this phase's move). Recorded for the hardening pass, as the plan itself directs.

### Phase-11 rank-shift warning (carried forward)

`shell.spec.ts` will move from `tests/e2e/` into `src/features/shell-fs/…` under the same alphabetically-sorted real index. Phase 11's break table must be checked for the same class of rank-shift R8 found here (a spec's own relocation changing where its source text sorts relative to a real path it queries), not just stale literal paths — a sweep for moved paths structurally cannot see this class of break, as row 14 already proved once.

### Citation sweeps (step 7)

- **Sweep 1** (numbered plan/phase/decision citations): found and fixed one real hit — `grep.spec.ts`'s "Decision 7, PLAN.md" (see above, commit `0dfc5f3`). Clean after the fix.
- **Sweep 2** (bare-noun process citations): all hits reviewed and are legitimate current-constraint prose, not process-artifact citations — `"prototype order"`/`"prototype snapshot"`/`"the prototype hardcodes"` describe v1 behavior the code deliberately ports (a current constraint the code implements, per the plan's own judgment rule), and the "Mechanics 5b"/"Mechanics 6" citations are kept per the audited-precedent finding above. **One item hand-checked specifically because the regex structurally cannot catch it** (no trailing space before the closing paren, the same blind spot as "refactor."): the kept "v2 rebuild" phrase in the fixed `grep.spec.ts` comment — reviewed and kept as generic descriptive prose (not a citation of a specific nonexistent document), consistent with the judgment rule.
- **Sweep 3** (path-existence): 87 path-shaped strings found across `src/features/grep`; every one resolves to a real file or module specifier, **except the two named false-positive classes**: (a) `tests/unit/grep.test.ts` (now `src/features/grep/tests/unit/grep.test.ts`) lines 33-38's `"src/components/GrepOverlay.svelte"` (×2) and `"src/lib/grep.ts"`, plus every path inside `src/features/grep/tests/ui/support/grep-index.json` — all R4-frozen fixture content, not citations; (b) `Homepage.dc.html` references (6 sites) resolve correctly to `common/tests/ui/support/reference/Homepage.dc.html`. One additional self-authored usage worth naming: the harness spec's own `"src/lib"` query string (typed into the overlay to exercise the frozen fixture's own path-hit rows) is a query against fixture data, not a claim that `src/lib/` still contains grep files in the real tree — reviewed and kept.
- **R7 hand-check**: all four named files hand-checked (not just grepped) for the "relocation refactor"/"Pure relocation" phrasing; three carried it and were fixed (step 2), `GrepOverlay.svelte` did not.

### Cross-feature edge scan

Every relative import under `src/features/grep` resolved against the filesystem (not substring-matched): every one resolves to `src/common/`, `common/tests/`, or a same-feature sibling. **Zero feature→feature imports authored.** Repo-wide count re-verified: still **2** (notifications' pre-existing `boot-state` pair from phase 06, untouched by this phase).

### Known unresolved item for the orchestrator

**Break-table row 13 needs correcting in `Instructions/10-grep/PLAN.md`** — it names the wrong file/lines and describes an edit that would violate R4. No code fix was made or was needed; the row itself is what's wrong.

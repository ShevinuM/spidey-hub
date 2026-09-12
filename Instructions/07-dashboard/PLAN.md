# Phase 07 — dashboard

> **Status: planned 2026-09-12 (rewritten from the 2026-08-29 stub), not started.** Binding decisions: `Instructions/00-phases.md` (the only cross-phase document this plan may read). This plan is self-contained: every mechanism it needs is stated here verbatim, so the executor never reads another phase's folder.

## Context

**`src/features/dashboard`.** Everything below is scoped to it except the declared out-of-context wiring.

This phase is **mechanically lighter than phases 03–06 on two axes and heavier on one**. Lighter: there is **no content collection** (ruling R3 — `src/content.config.ts` is not edited at all, unlike every prior feature phase) and **no fixture move** (ruling R2). Heavier: ruling **R1** sends the tracker half of this phase's original goal line into `src/common/` instead of into this feature, so the phase performs a declared, behavior-free move into a closed phase's context. Read R1 and R2 before step 1 — an executor who assumes phase 06's shape will do the wrong thing twice.

**Declared out-of-context wiring** (mechanical only — D24's closing clause; no behavioral edits outside the context, ever):

| file | why |
|---|---|
| `playwright.config.ts` | three project entries (§Mechanics 3) |
| `package.json` | `test:e2e` / `test:visual` explicit lists |
| `src/common/lib/data.ts:23` | `dashboard.yaml` `?raw` import re-point (D17) |
| `src/common/lib/data.ts:24` | `tracker.yaml` `?raw` re-point → `../content/tracker.yaml` (R1) |
| `src/common/components/PaneTree.svelte:39` | import path for `Dashboard.svelte` (ruling R4) |
| `src/pages/harness/[feature].astro` | one `dashboard` branch (D24) |
| `tests/visual/identical.spec.ts` | `SPLIT_OWNED_RECIPE_NAMES` gains **both** `01-dashboard` and `08-tracker` |
| `common/tests/ui/visual/identical.spec.ts` | `COMMON_OWNED_RECIPE_NAMES` gains `08-tracker`; header comment updated (R1) |
| `src/common/content/tracker.yaml` | R1 destination (new file at a closed context) |
| `common/tests/unit/tracker-hud.test.ts` | R1 destination (new file at a closed context) |
| `common/tests/ui/visual/goldens/<vp>/08-tracker.png` | R1 destination (new files at a closed context) |
| `docs/testing/{e2e,visual}/running-tests.md` | project rows (doc-practice, same commit) |
| `tests/visual/goldens/<vp>/{01-dashboard,08-tracker}.png` | deleted after the copies are verified |

**Explicitly NOT touched by this phase** — verified, not assumed. Do not edit these; if you believe one needs editing, stop and report:

- `src/content.config.ts` — there is no `dashboard` or `tracker` collection (R3).
- `fixtures/contributions.json` and `package.json`'s `build:fixtures` `cp` clause for it (R2).
- `scripts/generate.mjs` — `generateContributions()` is build tooling and stays (R2).
- `src/pages/*.astro` (the six real pages) — D10: Astro hard-codes them; they call `getDashboard()`/`getTracker()` from `common/lib/data.ts`, and only the `?raw` paths move beneath them.
- `src/common/components/Wallpaper.svelte` — renders tracker, stays exactly where it is (R1).
- `vitest.config.ts` — already globs both `common/tests/unit/**/*.test.ts` and `src/features/*/tests/unit/**/*.test.ts`. **No change needed.**

## Objective

The dashboard view and its wordmark live in `src/features/dashboard/`, moved verbatim, with `dashboard.spec.ts` and the `01-dashboard` golden green at both viewports and zero golden churn; the tracker's yaml, unit test and `08-tracker` golden are re-homed into `common/` per R1; and a `dashboard-harness` route mounts `Dashboard.svelte` with no Terminal kernel.

## Background — verified inventory

Every path below was verified on disk. **Do not re-derive; do verify before editing.**

### Move table A — this phase's context (`src/features/dashboard`)

| from | to | lines |
|---|---|---|
| `src/components/Dashboard.svelte` | `src/features/dashboard/components/Dashboard.svelte` | 112 |
| `src/lib/wordmark.ts` | `src/features/dashboard/lib/wordmark.ts` (already kebab-case — D15 needs no rename) | 23 |
| `src/data/dashboard.yaml` | `src/features/dashboard/content/dashboard.yaml` (D17) | 45 |
| `tests/e2e/dashboard.spec.ts` | `src/features/dashboard/tests/ui/e2e/dashboard.spec.ts` | 103 |
| `tests/visual/goldens/<vp>/01-dashboard.png` | `src/features/dashboard/tests/ui/visual/goldens/<vp>/` | 2 files |

**This feature owns no unit test.** `tracker-hud.test.ts` was the only candidate and it is common's (R1), so `src/features/dashboard/tests/unit/` is never created. Do not invent a unit test to fill the gap — backfilling coverage is decided per phase on size (00-phases.md, D23 closing note), and nothing here is uncovered by the e2e spec.

### Move table B — R1's tracker re-home (out of context, into `common/`)

| from | to | lines |
|---|---|---|
| `src/data/tracker.yaml` | `src/common/content/tracker.yaml` (joins `site.yaml`, `cmdline.yaml`, `choosetree.yaml`) | 117 |
| `tests/unit/tracker-hud.test.ts` | `common/tests/unit/tracker-hud.test.ts` (joins `cmdline/docline/tmux/views/vim.test.ts`) | 36 |
| `tests/visual/goldens/<vp>/08-tracker.png` | `common/tests/ui/visual/goldens/<vp>/` | 2 files |

Note the two different `common` roots, both correct and both already in use — **application source** nests under `src/common/` (`src/common/content/`), while **tests** are top-level (`common/tests/`). That split is D21(b)'s settled convention, not an inconsistency. Verify against the existing siblings before writing either path.

### Orchestrator rulings (do not re-litigate — architecture R003)

- **R1 — the tracker is `common`'s, not dashboard's.** The phase table's original goal line said "dashboard + wordmark + tracker HUD", and pre-phase's `recipe-feature-map.md` explicitly deferred the `08-tracker` ownership question to this phase. It is now decided: **common.** Evidence: the tracker map is rendered solely by `src/common/components/Wallpaper.svelte` — named explicitly in D10's kernel-chrome list and moved to `common/components/` back in phase 02 — which paints it on **every** view (dimmed at `NON_TRACKER_OPACITY`, full-strength only when `view === "retina-v"`, `Wallpaper.svelte:42-43`); `getTracker()` (`data.ts:234`) and the `TrackerData` type already live in `common/lib/data.ts`; the `08-tracker` recipe's own `check.visible` is `[data-testid="wallpaper-layer"]` (`recipes.ts:129`), i.e. it asserts common's pixels; and `Dashboard.svelte` contains **zero** tracker references. This follows the same component-owner convention that already sent `06-editor` to common even though Employment is its entry point. There is **no** `Tracker.svelte`/`TrackerHud.svelte` anywhere in the tree — do not go looking for one. Full reasoning is recorded under D17 in `00-phases.md` and in `recipe-feature-map.md`'s row 8. Moving these three artifacts into a closed phase's context is sanctioned as a declared, behavior-free, test-infra-and-content-only edit (same clause that lets a phase fix shared kernel-chrome page objects in closed contexts); it does **not** reopen phase 02 and it does **not** touch `Wallpaper.svelte`.
- **R2 — `fixtures/contributions.json` is NOT touched by this phase.** D7's original mapping assigned it to dashboard; the code falsifies that. It has zero dashboard consumers, and its only reader is `src/components/repositories/repositoriesState.svelte.ts` (runtime `fetch("/generated/contributions.json")`) feeding `StatusPanel.svelte` — phase 09's context, where it now moves. Leave the file, and leave `build:fixtures`'s `cp fixtures/contributions.json …` clause, **exactly as they are**. Recorded under D7 in `00-phases.md` and added to phase 09's move table. Note `public/generated/contributions.json` is a *different* file — a generated artifact written by `generateContributions()` in `scripts/generate.mjs` — and it is live-drift that §Mechanics 8 reverts before committing. **Do not confuse the two.**
- **R3 — no content collection, so `src/content.config.ts` is not edited.** Verified by full read: `collections = { repositories, personnel, profile, help, notifications, boot }` — no `dashboard`, no `tracker`. Both yamls load via plain `?raw` imports in `common/lib/data.ts`, not via Astro collections. Every prior feature phase edited a `base:` pointer here; **this one must not**. There is also no `getStaticPaths` fixture-switch and no `build*(await getCollection(...))` builder for dashboard — `getDashboard()`/`getTracker()` are plain getters.
- **R4 — `PaneTree.svelte` → `Dashboard.svelte` is a path-only update, recorded as D23(c).** `src/common/components/PaneTree.svelte:39` imports `Dashboard.svelte` and renders it at line 189. This is a common→feature edge whose *direction pre-existed the move*, and it is the exact case 00-phases.md's D23(c) ruling already names verbatim for `PaneTree.svelte`→`Profile.svelte`. Update the path; **do not create a re-export shim, a stub, or an injection registry** — the bootstrap-injection registry is a Deferred hardening item, not this phase's work. Record the edge in Results with the exemption named.
- **R5 — no library-swap step.** Nothing in `00-phases.md` gives this phase an analog of phase 04's D11 fuzzysort step. This is the 5-step loop plus R1's re-home plus the harness, and nothing else.
- **R6 — the harness must synthesize four props; this is a sanctioned divergence, not a bug.** `Dashboard.svelte`'s `Props` (lines 8-25) are `dashboard`, `isFocused`, `windowNumbers: Record<string, number>`, `paneCount: number`, `onSelect`. In the real app all four non-data props come from live tmux state that `Terminal.svelte`/`PaneTree.svelte` own — which is precisely what a kernel-free D24 harness excludes. Seed them with fixed synthetic values and document the choice in a header comment on the harness file, the same way boot's harness documents `desktopMode={true}` and notifications' documents `fixtureMode={false}`. `windowNumbers` must carry the real window-id→number mapping the spec asserts against (`dashboard=0, repositories=1, employment=2, retina-v=3, profile=4, help=5` — `views.ts`'s own documented table) so the hotkey column renders truthfully; `paneCount` is any fixed integer the spec then asserts through `dashboard.footer.syncLineTemplate`. **Do not stall on this and do not wire tmux into the harness.**

### Other verified facts

- **Recipe ownership.** `01-dashboard` (`recipes.ts:79`, `actions: []`, direct load) and `08-tracker` (`recipes.ts:126-130`, `actions: [Control+b, 3]`) both live in the **same** exported array, `recipes`. Every exported array was checked (`recipes`, `extraRecipes`, `bootRecipes`, `cmdlineRecipes`, `iteration3Recipes`, `notificationsRecipes`) — only `recipes` contains either name. Confirm this yourself before writing either filter set; phase 04 found a feature's recipes split across two arrays.
- `common/tests/ui/visual/identical.spec.ts` **already imports `recipes`** (alongside `cmdlineRecipes` and `iteration3Recipes`), so adding `08-tracker` to `COMMON_OWNED_RECIPE_NAMES` is a one-line filter change plus a header-comment update. No new import.
- **Golden census.** `tests/visual/goldens/{1512x945,1920x1080}/` currently holds 11 recipes (22 PNGs): `01-dashboard, 02-repositories, 03-repositories-arrow, 04-employment-l0, 05-employment-l1, 08-tracker, 09-grep-empty, 10-grep-query, 12-all-projects, 16-shell, 17-host-shell`. After this phase: root drops to **9 recipes / 18 PNGs**, dashboard gains **1 recipe / 2 PNGs**, common goes **4 → 5 recipes / 8 → 10 PNGs**. Repo-wide total stays **21 recipes / 42 PNGs**.
- `tests/visual/identical.spec.ts`'s `SPLIT_OWNED_RECIPE_NAMES` currently holds: `06-editor, 15-cmdline, 18-split, 19-choose-tree, 07-profile, 11-help, 20-help-search, 13-boot-mid, 14-boot-ready, 21-notifications-panel-open`. It gains two names this phase.
- **`wordmark.ts` has exactly one consumer** (`Dashboard.svelte:6`). D16's rule-of-three does not apply; it is not a promotion candidate.
- `src/bootstrap/Terminal.svelte:29,80` uses the `DashboardData` **type** from `common/lib/data` — **not** a component import. Nothing to fix there.
- DOM-contract consumers that need **no** edit: `common/tests/ui/e2e/nav.spec.ts:88,255,405-427`, `src/features/boot/tests/ui/e2e/{boot,cold-boot}.spec.ts`, `tests/e2e/{shell,grep}.spec.ts`, `common/tests/ui/e2e/{sessions,terminal}.spec.ts` all assert `[data-testid="dashboard-wordmark"]` / `[data-testid="dashboard-menu-row"]`. Those are **testid strings, not module imports** — the move does not touch them. Do not "fix" them.
- `common/tests/ui/support/reference/Homepage.dc.html:571,610` mentions Dashboard in a vendored frozen prototype string. Historical, out of scope, no edit.
- **Unit baseline: 346 passed / 20 files.** `tracker-hud.test.ts` relocating from `tests/unit/` to `common/tests/unit/` is a pure relocation — both globs are already in `vitest.config.ts`, so the count and the file count must both be **unchanged** afterwards.
- **Literal path *strings* in out-of-context tests — swept, and this phase is clean.** Path strings do not import anything, so an importer sweep can miss them; they were swept separately with `grep -rn "components/Dashboard\|lib/wordmark\|data/dashboard\|data/tracker\|tracker-hud" common/tests tests docs`. The only hits are the four comment/literal lines already listed under "Stale-path comment debt" plus the vendored `Homepage.dc.html` (historical, no edit). In particular **`common/tests/unit/views.test.ts` needs no edit in this phase** — verified, not assumed: its `expectedView()` whitelist contains no dashboard, wordmark or tracker entry, and `grepPathToView` (`views.ts:130-143`) matches on **filename/segment** (`EmploymentRecords.svelte`, `content/personnel/`, `Wallpaper.svelte`, `Profile.svelte`), never on a `features/<name>/` prefix — so `src/features/dashboard/components/Dashboard.svelte`, `…/lib/wordmark.ts`, `…/content/dashboard.yaml` and `src/common/content/tracker.yaml` all still route `null`, exactly as they do today, and the `routed.length >= 8` assertion is unaffected. `Wallpaper.svelte` is already at its final path and does not move (R1). **Do not edit `views.test.ts`.** (It is listed here because phase 08 *will* have to edit it — that is employment's problem, not this phase's.)
- **v1 drift** (each current v2 path vs the v1 working tree at `/Users/shev/Development/spidey-hub`): `wordmark.ts`, `dashboard.yaml`, `tracker.yaml` are **byte-identical**. `Dashboard.svelte` and `dashboard.spec.ts` **differ only by path rewrites** already applied in earlier phases. `tracker-hud.test.ts` differs only by pre-phase's D3 `node:test` → Vitest mechanical port. **Nothing is genuinely diverged** — if a file looks rewritten, you have the wrong file.

### Stale-path comment debt (fix in the same change as the move that invalidates it)

These are comment/doc text, not logic. Each is stale the moment its file moves; fixing them is D8's sanctioned same-change update, **not** a spec rewrite:

- `tests/e2e/dashboard.spec.ts:1` — `// Behavioral e2e safety net for Dashboard.svelte (PLAN.md Phase A)`. A citation of a v1 planning doc that does not exist in this repo (comments.md R008). **This is the one known citation-sweep hit** — pre-empt it rather than letting the auditor find it, as it did in phases 05 and 06.
- `tests/e2e/dashboard.spec.ts:4,20` — two comment references to `src/data/dashboard.yaml`.
- `tests/unit/tracker-hud.test.ts:1` — comment reference to `src/data/tracker.yaml`.
- `tests/unit/tracker-hud.test.ts:20` — **live literal path**, not a comment: `readFileSync(join(ROOT, "src/data/tracker.yaml"))`, with `ROOT = join(import.meta.dirname, "../..")` at line 13. **Both the literal and `ROOT`'s depth change** when the file lands in `common/tests/unit/`. This is D8, mandatory, in the same change.
- `src/data/tracker.yaml` — its own comment claims the box widths are "referenced from tracker.yaml's own comment" by the unit test. Grep the yaml for a path reference to `tests/unit/tracker-hud.test.ts` and repoint it if present.

## Mechanics (settled by phases 02–06; reuse verbatim, do not redesign — architecture R003)

**1. D21(a) snapshot paths.** The root `snapshotPathTemplate` stays `"tests/visual/goldens/{projectName}/{arg}{ext}"`. Every split visual project carries its **own** template with the viewport as a **literal**, never `{projectName}`.

**2. Project naming.** A Playwright project is 1:1 with one `use` config, so each tier emits **two** entries via `viewports.map(...)`. **There is no bare alias and no glob** — `--project=dashboard` and `--project="*-visual"` both error. Always the two explicit flags.

**3. The three project entries this phase adds** to `playwright.config.ts`, appended after the `notifications-harness` entry:

```ts
...viewports.map((viewport) => ({
  name: `dashboard-${viewport.name}`,
  testDir: "./src/features/dashboard/tests/ui/e2e",
  use: { ...devices["Desktop Chrome"], viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 },
})),
...viewports.map((viewport) => ({
  name: `dashboard-visual-${viewport.name}`,
  testDir: "./src/features/dashboard/tests/ui/visual",
  snapshotPathTemplate: `src/features/dashboard/tests/ui/visual/goldens/${viewport.name}/{arg}{ext}`,
  use: { ...devices["Desktop Chrome"], viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 },
})),
{
  name: "dashboard-harness",
  testDir: "./src/features/dashboard/tests/ui/harness",
  use: { ...devices["Desktop Chrome"], viewport: { width: viewports[0].width, height: viewports[0].height }, deviceScaleFactor: 1 },
},
```

No new `common-visual` project is needed for `08-tracker` — the `common-visual-<viewport>` projects already exist and already point at `common/tests/ui/visual`.

**4. D24 harness route.** `src/pages/harness/[feature].astro` is one shared dynamic route gated by `if (process.env.PORTFOLIO_FIXTURES !== "1") return [];` in `getStaticPaths`. Add a `dashboard` entry to (a) the `getStaticPaths` array, (b) a `const dashboard = feature === "dashboard" ? getDashboard() : undefined` line, and (c) a conditional block in the template. Because `Dashboard.svelte` is a real, already-shipping component that `PaneTree.svelte` mounts directly, **prefer mounting it directly** with R6's synthetic props; add a harness-only wrapper only if something genuinely needs composition the route cannot express. A direct mount also avoids the dead-chunk artifact a wrapper leaves in the real build (ruled harmless, but avoid it for free).

**5. Harness hydration race — required.** Whenever the harness ships `client:load`, the server-rendered HTML exists before hydration, so a spec that waits on a content locator races the listener attaching. Render an `onMount`-flipped element and wait on **that**:

```svelte
<div data-testid="dashboard-harness-ready" data-ready={ready}></div>
```

**5b. Harness assertions are web-first — do not copy the ported spec's reads.** Phase 05 lost a fix round to this. A verbatim-ported spec may read values non-retryingly (`textContent()`, `page.evaluate()`) because it races a *live* clock. A harness spec does not inherit that justification: its state is static, so there is no race to guard against. Assert through the page object with `await expect(pageObject.x).toHaveText(...)` / `.toHaveAttribute(...)`. **`playwright.md` R002 bans CSS selectors unconditionally — that includes `document.querySelector` inside `page.evaluate()`**, the exact shape phase 05 got wrong. The one sanctioned non-retrying read is deriving an *expected value* to feed a web-first assertion — never as the assertion itself.

**6. Page objects.** `src/features/dashboard/tests/ui/pages/DashboardPage.ts`, a sibling of `e2e/`/`visual/`/`harness/`. A feature page object **may not** redefine kernel-chrome locators — compose the shared class:

```ts
import { StatusBarPage } from "../../../../../../common/tests/ui/pages/StatusBarPage";
```

Verify that relative depth with `node -e "…path.relative…"`; do not guess it.

**7. Locators.** `playwright.md` R002 bans CSS selectors unconditionally, even scoped off a resolved testid. If a repeated element needs narrowing, add a real `data-testid` to the markup (attribute-only, zero pixel change, goldens re-verified in the same change — D24's sanctioned mechanical edit). Any testid **authored** in this phase must carry the `dashboard-` prefix (files-and-naming R014); only *ported* markup is exempt.

**8. Per-commit index self-consistency (toolchain R012).** If this phase's edits span multiple commits, run `pnpm generate` **per commit against that commit's own tree** (stash uncommitted files first) and diff `public/generated/{grep-index,fs-index}.json` **programmatically** — both are single-line JSON, so `git diff` alone is useless. Revert unrelated live-data drift (`public/generated/contributions.json`, `src/generated/commits/daily-tech-digest.json`, `src/generated/file-icons.json`) with `git checkout --` before committing. Note `scripts/generate.mjs` walks only `["src","scripts","tests"]`, so files under `common/tests/` legitimately drop out of both indexes — expect `tracker-hud.test.ts` to **leave** the indexes in step 3, and expect `08-tracker.png`'s move into `common/tests/` to do the same.

## Steps

- [x] **1. Port the dashboard spec + golden; add the project entries.**
  `git mv tests/e2e/dashboard.spec.ts src/features/dashboard/tests/ui/e2e/dashboard.spec.ts`. Repoint its `fixtures` import (line 8) to `../../../../../../common/tests/ui/support/fixtures` — **extensionless**, stripping the `.ts` it currently carries (D23(d): a feature phase's spec-port step MUST strip it) — after verifying the depth with `path.relative`.
  Create `src/features/dashboard/tests/ui/visual/identical.spec.ts`, modeled on `common/tests/ui/visual/identical.spec.ts`'s shape, importing the `recipes` array and filtering to a `DASHBOARD_OWNED_RECIPE_NAMES` set containing exactly `01-dashboard`. Keep the `api.github.com` abort `beforeEach` — every sibling identical spec has it.
  `cp` both `01-dashboard.png` goldens into `src/features/dashboard/tests/ui/visual/goldens/<vp>/`; `cmp` each against the pre-move copy **and** against v1's copy at `/Users/shev/Development/spidey-hub/tests/visual/goldens/`; only then delete the originals. Add `01-dashboard` to `tests/visual/identical.spec.ts`'s `SPLIT_OWNED_RECIPE_NAMES` and update its header comment.
  Add the three project entries (§Mechanics 3); extend `package.json`'s `test:e2e` with `--project=dashboard-1512x945 --project=dashboard-1920x1080` and `test:visual` with the new `identical.spec.ts` path **only**. The harness spec path is added in step 6, when the spec exists — Playwright exits 1 on a path that resolves to no tests, so adding it here reds this step's own gate. (The `dashboard-harness` *project entry* is fine to add now; an empty `testDir` is not an error, an unmatched spec path is.) Sweep `docs/testing/{e2e,visual}/running-tests.md` in this same commit — read the existing `profile`/`help`/`notifications` rows and match their format exactly; **verify every project name against real `playwright test --list` output before writing any row** (phase 03 shipped fabricated bare-alias rows twice).
  *Verify:* `pnpm build`, then the D20(a) real-build project list **plus** `--project=dashboard-1512x945 --project=dashboard-1920x1080` → all green. Then `pnpm build:fixtures` and the `test:visual` spec list including the new `identical.spec.ts` → all green. `playwright test --list` names all three new projects.

- [x] **2. Move dashboard source; update every importer; delete originals.**
  `git mv` `Dashboard.svelte` → `src/features/dashboard/components/`, `wordmark.ts` → `src/features/dashboard/lib/`, `dashboard.yaml` → `src/features/dashboard/content/`.
  Repoint: `Dashboard.svelte`'s own imports of `../common/lib/data`, `../common/lib/views` and `../lib/wordmark` to their new relative depths; `src/common/lib/data.ts:23`'s `dashboard.yaml` `?raw` path; and `src/common/components/PaneTree.svelte:39` (R4 — path only).
  Fix the stale comment paths listed in §Background (`dashboard.spec.ts:4,20`).
  `pnpm generate`; diff both indexes programmatically.
  *Verify:*
  ```bash
  test ! -e src/components/Dashboard.svelte
  test ! -e src/lib/wordmark.ts
  test ! -e src/data/dashboard.yaml
  grep -rn "components/Dashboard\|lib/wordmark\|data/dashboard\.yaml" src tests common scripts docs
  ```
  The grep must return **only** intentionally-updated lines — no stale residue. Record the `PaneTree` edge in Results for the auditor, naming the D23(c) exemption.

- [x] **3. R1 — re-home the tracker into `common/`. Its own commit, not folded into step 2.**
  It is a different context and a different reviewable unit (toolchain R012).
  `git mv src/data/tracker.yaml src/common/content/tracker.yaml` and repoint `src/common/lib/data.ts:24` to `../content/tracker.yaml?raw` (it becomes internal to common — compare the neighbouring `site.yaml`/`cmdline.yaml`/`choosetree.yaml` imports and match their form).
  `git mv tests/unit/tracker-hud.test.ts common/tests/unit/tracker-hud.test.ts`. **Fix `ROOT`'s depth and the literal yaml path together** (`ROOT = join(import.meta.dirname, "../..")` is wrong from the new location) — verify the new depth with `node -e "…path.relative…"` and cross-check against the sibling tests already in `common/tests/unit/`; do not guess. Update its line-1 comment to the new yaml path, and repoint any reference inside `tracker.yaml` itself back to the test's new path.
  `cp` both `08-tracker.png` goldens into `common/tests/ui/visual/goldens/<vp>/`; `cmp` against the pre-move copy **and** v1's copy; only then delete the originals. Add `08-tracker` to `COMMON_OWNED_RECIPE_NAMES` in `common/tests/ui/visual/identical.spec.ts` **and** to `SPLIT_OWNED_RECIPE_NAMES` in `tests/visual/identical.spec.ts`; update both header comments (common's enumerates its four recipes by name and cites the recipe-feature-map — it now names five, and should cite this phase's R1 ruling for why the fifth arrived late).
  `pnpm generate`; diff both indexes programmatically (expect `tracker-hud.test.ts` to leave the indexes — `generate.mjs` does not walk `common/`).
  *Verify:*
  ```bash
  test ! -e src/data/tracker.yaml && test ! -e tests/unit/tracker-hud.test.ts
  test ! -e tests/visual/goldens/1512x945/08-tracker.png
  grep -rn "data/tracker\.yaml\|tests/unit/tracker-hud" src tests common scripts docs
  ```
  `pnpm test:unit` → **346 passed / 20 files**, unchanged (pure relocation, both globs already configured). Fixture build → `--project=common-visual-1512x945 --project=common-visual-1920x1080` green with five recipes each.

- [x] **4. Full gate, from the clean committed tree.** Not folded into any prior commit.
  *Verify:* `pnpm check` → 0 errors. `pnpm lint` → exit 0. `pnpm test:unit` → 346/20, unchanged. D20(a) real build → `smoke`, `legacy-*`, `common-*`, `profile-*`, `help-*`, `boot-*`, `notifications-*`, `dashboard-*` all green. D20(b) fixture build → every `*-visual` + legacy visual + the **four existing** harness specs (`profile`, `help`, `boot`, `notifications`) green. Dashboard's own harness does not exist yet — it lands in step 6 and is gated there. `public/generated/*` unchanged by this step. These runs auto-background past the 120s foreground default — monitor to completion, never sleep-poll.

- [x] **5. Golden parity — zero churn.**
  *Verify:* `diff -rq tests/visual/goldens /Users/shev/Development/spidey-hub/tests/visual/goldens` shows **only** `Only in …` lines for every recipe split out by phases 02–07 — never a `differ` line. `cmp` each of this phase's four moved goldens (`01-dashboard` ×2, `08-tracker` ×2) against v1's byte-for-byte. Repo-wide total stays 21 recipes × 2 viewports = 42 PNGs, redistributed: root 18, common 10, dashboard 2, plus the other features' existing 12. **No `--update-snapshots`, ever (D5).**

- [x] **6. Feature harness (D24).**
  Add the `dashboard` branch to `src/pages/harness/[feature].astro` (§Mechanics 4), the ready-element (§Mechanics 5), R6's synthetic props with their documenting header comment, a `DashboardPage` page object (§Mechanics 6), and specs at `src/features/dashboard/tests/ui/harness/dashboard.spec.ts` asserting mount plus the component's own self-contained behavior: the wordmark renders with its aria-label, the five menu rows carry their labels/icons/key-hint bindings from `dashboard.yaml`, and the footer sync line interpolates `paneCount`. Assert kernel-free isolation via the composed `StatusBarPage`: `expect(page.statusBar.windows).toHaveCount(0)`.
  **Do not assert row navigation via `onSelect`-driven routing** — in the real app `PaneTree.svelte` supplies that callback and Terminal owns the window switch; a harness has no router to navigate. Assert what the component renders, not what the kernel does with it (the same rule profile's harness follows for its `handleKey()` export). No goldens (D24(b)).
  Now that the spec exists, append its path to `package.json`'s `test:visual` (deferred from step 1).
  *Verify:* fixture build → `--project=dashboard-harness` green, and `pnpm test:visual` green as a whole with the new path in it. Real build → `test ! -d dist/harness` **and** `grep -rl "dashboard-harness-ready" dist --include="*.html"` empty.
  **Do not grep `dist` for `"Dashboard"`** — unlike phase 06's `NotificationsHarness` check, that name legitimately appears in every real page (`index.astro` server-renders the component), so it would report a false failure on a perfectly good build. The harness-only ready-marker from §Mechanics 5 is the discriminating string; use it. A bare `find dist -iname "*harness*"` will still match dead ~1 KB JS chunks from earlier phases' wrapper components — expected and ruled harmless (`00-phases.md`, Deferred), **not** a failure.

- [ ] **7. Record and close.**
  First run the **widened** plan-citation sweep over this phase's own context — note this is not the narrower regex phase 06's plan used:
  ```bash
  grep -rniE "plan\.md|phase [0-9]|defect [0-9]|decision [0-9]|iteration [0-9]|\b[fg][0-9]+\b" src/features/dashboard
  ```
  Run it over `common/tests/unit/tracker-hud.test.ts` and `src/common/content/tracker.yaml` too, since this phase authored their new homes. Rewrite any hit in the file's own terms (comment text only; a ported spec's logic is untouchable). The known hit is `dashboard.spec.ts:1`'s "PLAN.md Phase A". Apply judgment to each: a citation of a *process* artifact is the violation; a reference naming a *current* constraint the code implements is not, and must be left alone.
  Then fill in Results: every file moved, every importer updated, the D23 edges flagged for the auditor, gate outputs, the harness shape used, and the final golden distribution. Commit to `frontend-rewrite` — single-line imperative, **no body, no trailer** (toolchain R011), one reviewable unit per commit (R012).

## Acceptance criteria

1. Every file in move tables A and B is at its new path; `src/components/Dashboard.svelte`, `src/lib/wordmark.ts`, `src/data/dashboard.yaml`, `src/data/tracker.yaml` and `tests/unit/tracker-hud.test.ts` no longer exist.
2. `src/content.config.ts`, `fixtures/contributions.json`, `build:fixtures`, `scripts/generate.mjs` and `src/common/components/Wallpaper.svelte` are **unmodified** (R2/R3/R1).
3. `pnpm check` 0 errors, `pnpm lint` 0 findings, `pnpm test:unit` **346 passed / 20 files** — unchanged.
4. D20 both invocations green, including `dashboard-{1512x945,1920x1080}`, `dashboard-visual-*`, `dashboard-harness`, and `common-visual-*` carrying five recipes.
5. Zero golden churn; 42 PNGs repo-wide; `01-dashboard` and `08-tracker` byte-identical to v1 at both viewports; root goldens down to 9 recipes, common up to 5.
6. Real build emits no `dist/harness/` directory and no HTML page referencing the dashboard harness.
7. Verifier PASS **and** auditor clean on `src/features/dashboard` (D23 exemptions recorded with the exemption named).
8. Results filled in; no `(executor fills in)` placeholder.

## Stop conditions

- **No behavior changes.** No menu-row, wordmark-rendering, binding-table or sync-line logic edits. If a spec goes red on *logic*, the move is wrong, not the spec. **This does not forbid D8 path updates:** repointing an import or a literal filesystem path a move invalidated (e.g. `tracker-hud.test.ts:20`) is required. The line is behavior vs. location — change locations freely, never expectations.
- **No rewriting moved code** — no splitting `Dashboard.svelte`, no extracting the wordmark renderer, no promoting `wordmark.ts` to common (one consumer, D16 does not apply).
- **Do not touch the tracker's renderer.** R1 moves data, a unit test and a golden. `Wallpaper.svelte` does not move and is not edited.
- **Do not touch `contributions.json` or `content.config.ts`** (R2, R3). If you believe either needs editing, stop and report.
- **No golden regeneration**, no `--update-snapshots`.
- **No behavioral edits outside the context** — path updates only. R1's moves into `common/` are content/test-infra relocations, not behavior.
- If a step turns out to rest on a false assumption, **stop and report** rather than redesigning; the orchestrator updates this plan.

## Results

**Status: closed 2026-09-12.** Executed in 6 commits on `frontend-rewrite` (all local, none pushed): `02ed8c5` (step 1, spec+golden port), `bc8ba37` (step 2, source move), `799b8ab` (step 3, R1 tracker re-home), `bc2f2b5` (self-caught index-staleness fix, see below), `05415ab` (step 6, harness), `3dd052d` (audit fix round — stale comment strip). Step 4/5 were verification-only, no commit. Docs updated same-commit per doc-practice (`docs/testing/{e2e,visual}/running-tests.md`).

### Files moved

**Move table A (into `src/features/dashboard`):**
- `src/components/Dashboard.svelte` → `src/features/dashboard/components/Dashboard.svelte`
- `src/lib/wordmark.ts` → `src/features/dashboard/lib/wordmark.ts`
- `src/data/dashboard.yaml` → `src/features/dashboard/content/dashboard.yaml`
- `tests/e2e/dashboard.spec.ts` → `src/features/dashboard/tests/ui/e2e/dashboard.spec.ts`
- `tests/visual/goldens/{1512x945,1920x1080}/01-dashboard.png` → `src/features/dashboard/tests/ui/visual/goldens/<vp>/`

**Move table B (R1's tracker re-home, into `common/`):**
- `src/data/tracker.yaml` → `src/common/content/tracker.yaml`
- `tests/unit/tracker-hud.test.ts` → `common/tests/unit/tracker-hud.test.ts`
- `tests/visual/goldens/{1512x945,1920x1080}/08-tracker.png` → `common/tests/ui/visual/goldens/<vp>/`

**New (step 6, no prior location):**
- `src/features/dashboard/tests/ui/visual/identical.spec.ts`
- `src/features/dashboard/tests/ui/harness/{DashboardHarness.svelte,dashboard.spec.ts}`
- `src/features/dashboard/tests/ui/pages/DashboardPage.ts`

### Importers updated

- `src/features/dashboard/components/Dashboard.svelte` — its own imports of `common/lib/data`, `common/lib/views`, `../lib/wordmark` repointed to the new relative depths.
- `src/common/lib/data.ts:23` — `dashboardRaw` `?raw` import repointed to `../../features/dashboard/content/dashboard.yaml?raw`.
- `src/common/lib/data.ts:24` — `trackerRaw` `?raw` import repointed to `../content/tracker.yaml?raw` (internal to common now, matching the `site.yaml`/`cmdline.yaml`/`choosetree.yaml` form).
- `src/common/lib/data.ts` header comment — "Kernel-owned yaml (site/cmdline/choosetree)" → "(site/cmdline/choosetree/tracker)".
- `src/common/components/PaneTree.svelte:39` — `Dashboard` import repointed to `../../features/dashboard/components/Dashboard.svelte`. **This is the D23(c) edge flagged for the auditor**: a common→feature import whose *direction* pre-existed the move (PaneTree already imported Dashboard before this phase); only the path changed. Same exemption class already applied to `PaneTree.svelte`→`Profile.svelte` in phase 03. No re-export shim, stub, or injection registry was created (R4 forbids it) — the bootstrap-injection registry remains a Deferred hardening item.
- `src/pages/harness/[feature].astro` — added the `dashboard` `getStaticPaths` entry, the `getDashboard()` const, and the `<DashboardHarness>` mount block.
- `common/tests/unit/tracker-hud.test.ts` — `ROOT` depth changed from `../..` to `../../..` (verified against sibling idiom in `docline.test.ts`/`views.test.ts`); its literal yaml path repointed to `src/common/content/tracker.yaml`; header comment updated.
- `src/common/content/tracker.yaml` — its own comment pointing at the unit test's path repointed to `common/tests/unit/tracker-hud.test.ts`.
- `tests/visual/identical.spec.ts` — `SPLIT_OWNED_RECIPE_NAMES` gained `01-dashboard` and `08-tracker`; header comment updated to attribute both, noting tracker's move to common per R1.
- `common/tests/ui/visual/identical.spec.ts` — `COMMON_OWNED_RECIPE_NAMES` gained `08-tracker` (now 5 recipes); header comment updated to name and explain the fifth recipe's late arrival via R1.
- `playwright.config.ts` — added `dashboard-${viewport}`, `dashboard-visual-${viewport}`, `dashboard-harness` project entries; updated the `common-visual` block's stale "4 recipes" comment to name the fifth (`08-tracker`, via R1).
- `package.json` — `test:e2e` gained `--project=dashboard-1512x945 --project=dashboard-1920x1080`; `test:visual` gained `src/features/dashboard/tests/ui/visual/identical.spec.ts` (step 1) and `src/features/dashboard/tests/ui/harness/dashboard.spec.ts` (step 6, deferred as the plan directed).
- `docs/testing/{e2e,visual}/running-tests.md` — project rows and header counts updated for `dashboard-*`/`dashboard-visual-*`/`dashboard-harness`, verified against real `playwright test --list` output before writing (all three project names resolved correctly; `dashboard-harness` showed 0 tests until step 6, never an error).
- Stale comments fixed in the same change as their invalidating move: `dashboard.spec.ts:1` (stripped the "PLAN.md Phase A" citation — pre-empted in step 1 rather than left for step 7), `dashboard.spec.ts:4,20` (yaml path), `tracker-hud.test.ts:1,20` (yaml path + `ROOT`), `tracker.yaml`'s own comment (test path).

### Not touched (verified, not assumed)

`src/content.config.ts`, `fixtures/contributions.json`, `build:fixtures`'s fixture-copy clauses, `scripts/generate.mjs`, `src/common/components/Wallpaper.svelte`, `vitest.config.ts`, `common/tests/unit/views.test.ts` — all confirmed unmodified across every commit.

### Gate outputs

- `pnpm check` (final, clean tree, commit `3dd052d`): **0 errors**, 10 warnings (pre-existing, none dashboard-related), 96 hints. 968 files.
- `pnpm lint`: **exit 0** (oxlint), no findings.
- `pnpm test:unit`: **346 passed / 20 files** — unchanged from baseline at every checkpoint (steps 2, 3, 4, 6, and final), confirming the tracker-hud relocation was a pure move.
- D20(a) real build, full project list including `dashboard-1512x945`/`dashboard-1920x1080`: **1012 passed** (final run, from the fully closed tree). One transient failure (`legacy-1512x945 › repositories.spec.ts` "all-projects lists all 8 real project .md files") surfaced on the step-4 run; reproduced clean in isolation and clean on a full re-run — confirmed flake, unrelated to this phase's context (repositories/all-projects, phase 09's territory).
- D20(b) fixture build: **73 passed** (final run) — every `*-visual` project + legacy visual + all five harness projects (`profile`, `help`, `boot`, `notifications`, `dashboard`), including `dashboard-visual-{1512x945,1920x1080}` (1 recipe each) and `dashboard-harness` (4 specs).
- `common-visual-{1512x945,1920x1080}` in isolation (step 3 checkpoint): **10 passed**, five recipes each viewport (`06-editor`, `15-cmdline`, `18-split`, `19-choose-tree`, `08-tracker`).
- Real build's `dist/`: no `dist/harness/` directory; `grep -rl "dashboard-harness-ready" dist --include="*.html"` empty. `find dist -iname "*harness*"` shows `DashboardHarness.<hash>.js` alongside the pre-existing `HelpHarness`/`NotificationsHarness` dead chunks — the same pre-ruled-harmless artifact (00-phases.md Deferred: "phases 05–11 may ship the same dead chunk without a new ruling"). No `dist/harness/` route output, no fixture data — just a dead unreferenced ~1KB chunk, exactly the sanctioned shape.

### Golden distribution (zero churn)

`diff -rq tests/visual/goldens /Users/shev/Development/spidey-hub/tests/visual/goldens` → only `Only in …` lines, never `differ`. All four moved goldens (`01-dashboard`×2, `08-tracker`×2) `cmp`-verified byte-identical to both their pre-move copy and v1's original. Repo-wide total holds at **21 recipes × 2 viewports = 42 PNGs**:
- root (`tests/visual/goldens/`): **9 recipes / 18 PNGs** (`02-repositories`, `03-repositories-arrow`, `04-employment-l0`, `05-employment-l1`, `09-grep-empty`, `10-grep-query`, `12-all-projects`, `16-shell`, `17-host-shell`)
- common (`common/tests/ui/visual/goldens/`): **5 recipes / 10 PNGs** (`06-editor`, `08-tracker`, `15-cmdline`, `18-split`, `19-choose-tree`) — up from 4/8
- features (`src/features/*/tests/ui/visual/goldens/`): **7 recipes / 14 PNGs** (`01-dashboard`, `07-profile`, `11-help`, `13-boot-mid`, `14-boot-ready`, `20-help-search`, `21-notifications-panel-open`)

### Harness shape

Wrapper, not direct mount — `DashboardHarness.svelte`, modeled on `NotificationsHarness.svelte`'s shape (minus its keydown-routing reason for existing). Mechanics 4 prefers direct mount when nothing needs composition the route can't express, but Mechanics 5's `onMount`-flipped ready marker genuinely can't be expressed by `.astro` frontmatter (server-only) or by editing `Dashboard.svelte` itself (moved-verbatim production code — adding a test-only marker to it would be the exact rewrite-moved-code hazard the stop conditions forbid). Boot's harness avoided a wrapper only because `BootSequence.svelte` already ships its own `data-boot-running` marker; `Dashboard.svelte` has no equivalent, so a minimal wrapper was the only sanctioned option. The wrapper holds R6's four synthetic props (`isFocused={true}`, `windowNumbers` keyed by `ProgramName` per `views.ts`'s documented table — `dashboard=0, repositories=1, employment=2, retina-v=3, profile=4, help=5`, verified against `viewToTmuxBinding`'s actual lookup key before hardcoding, not just copied from the plan text — `paneCount={6}`, `onSelect` as a no-op) and nothing else; `onSelect`-driven navigation is deliberately not asserted by the harness spec, per the plan's explicit instruction.

`DashboardPage.ts` composes `StatusBarPage` (never redefines kernel-chrome locators) and uses only `getByTestId`/`getByText`/`.nth()` — no CSS selectors anywhere, confirmed clean by the auditor with no exemption needed (unlike the ported e2e spec, which is D23(a)-exempt for its raw locator strings).

### Two index-staleness findings (not this phase's regressions, but corrected in-phase)

1. **Phase 06 artifact, found and corrected as a side effect of the mandatory regenerate in step 1.** Regenerating `public/generated/{fs-index,grep-index}.json` in step 1 also corrected three `src/features/notifications/*` entries whose committed sizes didn't match their actual (unchanged) committed file content — a stale index left over from phase 06, predating this phase. Verified `generate.mjs` is fully deterministic over the real tree (no way to reproduce the old wrong values), so the corrected index was kept rather than hand-surgered back to a known-wrong state. Flagging here per this phase's own diligence, since it wasn't caught by phase 06's own close.
2. **Self-caught in step 3, fixed same-day (commit `bc2f2b5`).** Two advisor-recommended comment fixes (`playwright.config.ts`, `data.ts`) were made *after* step 3's `pnpm generate`/diff pass but were committed without re-running `generate` — leaving the just-committed index briefly stale against its own commit's tree. Caught during step 4's gate re-run (diff showed two unexpected size deltas), root-caused, and fixed with a dedicated one-line commit before proceeding. No behavior affected; purely a self-consistency lapse in the migration's own mechanics.

### Audit round

Auditor ran full `docs/checklist/` against `src/features/dashboard` after step 7's initial (clean) citation sweep. Found 14 "no" verdicts: 13 correctly fall under named D23 clauses (D23(c) for the `PaneTree.svelte`→`Dashboard.svelte` edge in both directions [architecture R004/R005]; D23(a) for the ported e2e spec's raw locators and non-extracted local helpers [playwright.md R001-R004, R009]; D23(b) for the repo-wide missing fitness-test/scenario-manifest mechanism [architecture R009, testing/README R009-R010]; D23(e) for tailwind.md R002/R004's pre-existing raw hex literals and toolchain.md R008's repo-wide missing formatter). **One genuinely blocked close**: `wordmark.ts:2-3` cited "the components audit's (c)-criterion cleanup" — a v1-era process artifact (traceable to v1 commit `3b50492`) with no corresponding doc in this repo, the same comments.md R008 pattern as the pre-empted "PLAN.md Phase A" citation, but missed by the widened regex sweep because it carries a letter ("(c)-criterion") not a digit. Fixed in commit `3dd052d`; re-verified clean (check/unit/e2e all still green) after the fix. **Sweep-widening note for phases 08-11**: the citation regex should also catch bare English process nouns ("audit", "cleanup", "criterion") alongside the numbered-decision forms — this is the same class of gap phase 06's "Decision 6" miss exposed for phase 05's narrower regex.

### Acceptance criteria — verified against final state

1. ✅ Every file in move tables A/B at its new path; all four old paths + `tests/unit/tracker-hud.test.ts` gone.
2. ✅ `src/content.config.ts`, `fixtures/contributions.json`, `build:fixtures`, `scripts/generate.mjs`, `Wallpaper.svelte` unmodified.
3. ✅ `pnpm check` 0 errors, `pnpm lint` 0 findings, `pnpm test:unit` 346/20 unchanged.
4. ✅ D20 both invocations green, including all `dashboard-*` projects and `common-visual-*` at 5 recipes.
5. ✅ Zero golden churn; 42 PNGs repo-wide; both moved recipes byte-identical to v1 at both viewports; root 9 recipes, common 5.
6. ✅ Real build: no `dist/harness/`, no HTML referencing the dashboard harness marker.
7. ⚠️ Partial. Auditor: one blocking finding (comments.md R008, `wordmark.ts:2-3`), fixed in `3dd052d`; the fix is comment-only and was re-verified by a widened citation sweep plus `pnpm check`/`test:unit`/e2e — but **no re-audit was run** after the fix, so "auditor clean" is not yet independently confirmed, only executor-verified. The other 13 "no" verdicts are exempted under named D23 clauses (documented above). **Verifier has not run at all** — that step belongs to the orchestrator's execute→verify loop, not this execution. Both halves of this criterion are the orchestrator's to close out, not mine to tick.
8. ✅ This section filled in; no placeholder remains.

### Left uncommitted (orchestrator's call, not mine)

`Instructions/00-phases.md`, `Instructions/01-pre-phase/recipe-feature-map.md`, and `Instructions/09-repositories/PLAN.md` were already modified on disk (uncommitted) when this executor run began — pre-existing orchestrator planning edits (the D7/D17 rulings, the phase-07 plan rewrite itself, phase ordering notes) that predate and are outside this execution. Left untouched and uncommitted deliberately: they aren't this phase's work product to author a commit message for. This file (`Instructions/07-dashboard/PLAN.md`) is committed as part of this phase's own close.

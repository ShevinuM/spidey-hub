# Recipe → feature map

> **Status: pre-phase deliverable, settled mapping — not a hypothesis.** Source of truth for the recipes themselves: `tests/visual/recipes.ts` (as it stands after pre-phase's bulk import, byte-identical to v1). Source of truth for phase/context ownership: `Instructions/00-phases.md`'s phase table and binding decisions (D9, D10, D11, D17). This file is written once, in pre-phase step 8, and is not expected to change as later phases execute — a later phase that finds a mapping wrong should correct this file in the same change (doc-practice R008 applies: any correction is a decision, not silently reverted history).

## Purpose

Every recipe in `tests/visual/recipes.ts` (and its corresponding golden PNGs, one per recipe per viewport) is captured today by `identical.spec.ts` against the *whole app*, inside the transient bulk-imported `legacy` project. As each phase 02–11 moves its context's code out of the legacy tree, its own `<context>/<feature>-visual` Playwright project needs to inherit exactly the recipes that exercise *its* rendered output — no recipe should be captured twice, none dropped. This file is that assignment, decided once so no phase has to re-derive it.

## Recipe count note

`Instructions/00-phases.md`'s pre-phase step-8 description says "23 recipes, 21 goldens/viewport" — the recipes.ts file as it stands has **21** named recipe objects (`01-dashboard` … `21-notifications-panel-open`, verified by extracting every `name: "<n>-…"` field across all six recipe arrays: `recipes` (10), `extraRecipes` (2), `bootRecipes` (2), `cmdlineRecipes` (1), `iteration3Recipes` (5), `notificationsRecipes` (1) = 21). 21 recipes × 2 viewports = **42 PNGs**, matching the 42-PNG figure in the same plan's step-8 verify line and the actual file count in `tests/visual/goldens/{1512x945,1920x1080}/` (21 each, confirmed). The "23" figure does not match the file as bulk-imported; treating "21 recipes / 42 PNGs" as ground truth here since it's independently corroborated by three counts (recipe objects, per-viewport golden files, and the plan's own "42 PNGs" verify target).

## The mapping

Ownership is decided by which component's rendered output the golden is actually a snapshot of — not by which route/window the recipe's key sequence happens to pass through to reach it. Several recipes reach their target view via a kernel window-switch (`Ctrl-b <N>`) or via another feature's entry point; the "reached via" column records that path for context, but the "owning phase" column is what a later phase should use when moving the recipe out of `legacy`.

| # | recipe | golden(s) | reached via | owning phase | why |
|---|---|---|---|---|---|
| 1 | `01-dashboard` | 01-dashboard | direct load | **07 dashboard** | Dashboard.svelte — not in D10's kernel-chrome list |
| 2 | `02-repositories` | 02-repositories | `Ctrl-b 1` | **09 repositories** | Repositories.svelte tree/panels |
| 3 | `03-repositories-arrow` | 03-repositories-arrow | `Ctrl-b 1 1 ArrowDown` | **09 repositories** | Repositories.svelte panel [1] selection |
| 4 | `04-employment-l0` | 04-employment-l0 | `Ctrl-b 2` | **08 employment** | EmploymentRecords.svelte default state (adversarial fixture row) |
| 5 | `05-employment-l1` | 05-employment-l1 | `Ctrl-b 2 j j` | **08 employment** | EmploymentRecords.svelte row-selection/preview/timeline |
| 6 | `06-editor` | 06-editor | `Ctrl-b 2 Enter` (Employment entry point) | **02 common** | D9: editor components + `editorRender` move to `common/components/editor/` — the golden asserts the shared Editor's own rendering, Employment is only the entry point used to reach it |
| 7 | `07-profile` | 07-profile | `Ctrl-b 4` | **03 profile** | Profile.svelte |
| 8 | `08-tracker` | 08-tracker | `Ctrl-b 3` (→ `/retina-v`) | **07 dashboard** (flagged — see note below) | named "tracker HUD" in phase 07's own goal line; the rendered content is `Wallpaper.svelte` + `tracker.yaml`'s HUD data |
| 9 | `09-grep-empty` | 09-grep-empty | `/` | **10 grep** | GrepOverlay.svelte — NOT in D10's kernel-chrome list, so grep is its own feature, not common |
| 10 | `10-grep-query` | 10-grep-query | `/` + type "svelte" | **10 grep** | same as above |
| 11 | `11-help` | 11-help | `Ctrl-b 5` | **04 help** | HelpView.svelte |
| 12 | `12-all-projects` | 12-all-projects | `Ctrl-b 1 1 Enter` | **09 repositories** | Repositories.svelte's virtual all-projects row |
| 13 | `13-boot-mid` | 13-boot-mid | clock offset (no keys) | **05 boot** | BootSequence.svelte |
| 14 | `14-boot-ready` | 14-boot-ready | clock offset (no keys) | **05 boot** | BootSequence.svelte post-outro → dashboard handoff |
| 15 | `15-cmdline` | 15-cmdline | `:` + type "rep" | **02 common** | D10: Cmdline is kernel chrome → `common/components/` |
| 16 | `16-shell` | 16-shell | `: q Enter` then `neofetch Enter` | **11 shell-fs** | Shell.svelte in its normal (attached-pane) mode |
| 17 | `17-host-shell` | 17-host-shell | `Ctrl-b d` (detach) | **11 shell-fs** (flagged — see note below) | same Shell.svelte component, `mode: "host"` — the detach TRIGGER is kernel/tmux (`common`), but the rendered pane is Shell.svelte's own host-mode branch |
| 18 | `18-split` | 18-split | `Ctrl-b \| Ctrl-b -` + 5× `Ctrl-b Space` | **02 common** | pane-tree layout cycling is tmux engine + `PaneTree.svelte`, both D10 kernel |
| 19 | `19-choose-tree` | 19-choose-tree | `Ctrl-b \| Ctrl-b w` | **02 common** | D10: ChooseTree is kernel chrome |
| 20 | `20-help-search` | 20-help-search | `?` + type "kil" | **04 help** | D11: helpSearch is part of phase 04 (pre-fuzzysort-swap verbatim move, then the swap itself, both inside phase 04) |
| 21 | `21-notifications-panel-open` | 21-notifications-panel-open | `n` | **06 notifications** | Notifications.svelte panel |

**Total: 21/21 recipes mapped, 42/42 PNGs mapped exactly once** (21 recipes × `1512x945` + `1920x1080`).

## Flagged ambiguities (for the owning phase to resolve, not pre-phase)

- **`08-tracker`:** `Wallpaper.svelte` (the component actually rendered, fullscreen, at this recipe's `/retina-v` state) is explicitly D10 kernel chrome moving to `common/components/` in phase 02. The *data* feeding it (`tracker.yaml`, `TrackerData`, the `tracker-hud.test.ts` unit test) is what phase 07's own goal line ("dashboard + wordmark + tracker HUD") names as dashboard-owned. So the component moves in phase 02 but this recipe is listed under phase 07 here, matching the phase table's explicit wording — phase 07 is who should decide, when it runs, whether this golden's Playwright project entry actually belongs under `common-visual` (component-owner convention, same as `06-editor`) or `dashboard-visual` (phase-table wording). Whichever way it's decided, decide once and update this row rather than leaving both phases assuming the other owns it.
- **`17-host-shell`:** the detach keystroke (`Ctrl-b d`) is dispatched by kernel/tmux code (`common`), but the rendered result is `Shell.svelte`'s own `mode: "host"` branch — the same component `16-shell` already assigns to `shell-fs`. Listed under `shell-fs` here for that consistency; flagged in case phase 02 (which owns the detach mechanics) or phase 11 disagrees once the actual spec file is being split.

## D21 snapshot-path decision (settled by phase 02, 2026-08-29)

Phase 02 (common) ran first, so it settles D21(a)+(b) here, once, for every later phase to reuse verbatim.

### D21(b): what `identical.spec.ts`/`adversarial-fixtures.spec.ts` actually compare against

Read both files (plus `playwright.config.ts`'s `webServer` array) before touching anything, per the ruling. Finding: **`identical.spec.ts` does NOT compare against the port-4400 reference server.** Its `beforeEach`/test bodies only ever navigate against `baseURL` (port 4322, the real/fixture implementation build); golden resolution goes through `expect(png).toMatchSnapshot({name})` + the root config's `snapshotPathTemplate`, which reads committed PNGs straight from `tests/visual/goldens/<viewport>/<recipe>.png` — no network call to port 4400 anywhere in the file. `identical.spec.ts`'s own header comment confirms this in prose: "This suite is now the goldens' SOLE authority: `tests/visual/capture-goldens.mjs`'s vendored-prototype path is retired to historical/guarded status ... and is never run as part of normal development." `adversarial-fixtures.spec.ts` is unrelated to goldens entirely (functional assertions only, no `toMatchSnapshot` calls) and also never touches port 4400.

The port-4400 `webServer` entry in `playwright.config.ts` is real (it does start `static-server.mjs` against the vendored `reference/` dir) but is vestigial for day-to-day gates: its only consumer is `capture-goldens.mjs`'s `--restore-prototype-parity`-gated, explicitly-guarded regeneration path, which the same header comment says is "kept only as a historical record." `pipeline.mjs` was independently checked (per the advisor's flag that the first read of `identical.spec.ts` alone doesn't prove `captureState()`/`captureBootState()` don't reach into port 4400 or `reference/` themselves) — `grep -n "4400\|reference" tests/visual/pipeline.mjs` returned only comment mentions of "vendored PROTOTYPE reference" as historical context, no functional dependency.

**Consequence for D21(b)'s caveat:** "identical" targets goldens, not the vendored prototype — the favorable case. Per-feature/per-context golden splitting is fully feasible; no reference-server coupling to design around. No hard stop.

### D21(b): shared visual/test infra's permanent home

Moved to **`common/tests/ui/support/`** — a **top-level** directory, sibling to `src/`, not nested under `src/common/`. This is not a phase-02 invention: pre-phase's own D6 step already created `common/tests/ui/support/fixtures.ts` + `content-fixtures.ts` at this exact top-level location (commit `f679650`/`713294b`/`d93d890`, "Add smoke + legacy Playwright projects and move test support fixtures"), and roughly half of `tests/e2e/*.spec.ts` (both kernel specs and several feature specs — dashboard, employment, help, profile, repositories, shell) already import from `../../common/tests/ui/support/fixtures.ts`. Phase 02 follows that established precedent rather than `docs/checklist/testing/README.md` R002's literal wording (which doesn't specify top-level vs. `src/`-nested) — primary evidence (an already-committed, already-consumed directory) overrides a plausible-but-uncommitted alternative reading. `common/tests/unit/` and `common/tests/ui/{e2e,visual}/` follow the same top-level convention, matching `Instructions/02-common/PLAN.md`'s own move-table wording ("`common/tests/ui/e2e/`", "`common/tests/unit/`" — no `src/` prefix). **Application source** (`engines/`, `components/`, `lib/`, `content/`) stays under `src/common/` per `architecture.md` R001's skeleton, which lists no `tests/` under `src/common/` at all — tests and source diverge at the top level by design.

Moved in phase 02's step 1 (not step 2, per D21(b)'s explicit "in the same step"): `pipeline.mjs`, `recipes.ts`, `static-server.mjs`, `capture-goldens.mjs`, `tests/checkFixtureFlag.ts` (renamed `check-fixture-flag.ts`, D15 kebab-case), `tests/visual/reference/` → all under `common/tests/ui/support/`.

### D21(a): snapshotPathTemplate / viewport handling for split projects

v1's single `snapshotPathTemplate: "tests/visual/goldens/{projectName}/{arg}{ext}"` assumed `{projectName}` was always exactly the viewport (`"1512x945"`/`"1920x1080"`). Once per-context visual projects need a context prefix in their name (`common-visual-1512x945`, later `<feature>-visual-<viewport>`) to stay unique, `{projectName}` no longer equals the viewport, breaking that template for split projects.

**Decision:** each split visual project sets its **own** `snapshotPathTemplate` in `playwright.config.ts`, with the viewport **hardcoded as a literal** (derived from the same `viewports` array entry the project's own `use.viewport` comes from, so it can't drift) rather than sourced from `{projectName}`:

```ts
...viewports.map((viewport) => ({
  name: `common-visual-${viewport.name}`,
  testDir: "./common/tests/ui/visual",
  snapshotPathTemplate: `common/tests/ui/visual/goldens/${viewport.name}/{arg}{ext}`,
  use: { ...devices["Desktop Chrome"], viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 },
})),
```

This reproduces `.../goldens/<viewport>/<recipe>.png` byte-identically (verified: phase 02 seeded `common/tests/ui/visual/goldens/{1512x945,1920x1080}/{06-editor,15-cmdline,18-split,19-choose-tree}.png` via `cp` from `tests/visual/goldens/`, then `cmp`'d each against the same recipe's PNG in v1's `/Users/shev/Development/spidey-hub/tests/visual/goldens/`, all 8 byte-identical) without depending on `{projectName}` matching the viewport at all. The pre-split, viewport-named projects (`"1512x945"`/`"1920x1080"`, testDir `./tests/visual`) keep the original root-level `snapshotPathTemplate` unchanged, since their `{projectName}` is still exactly the viewport. **Every later context/feature's own `<context>-visual-<viewport>` project reuses this exact per-project-template shape**, not `{projectName}`, and its own goldens live at `<context>/tests/ui/visual/goldens/<viewport>/` following the same top-level-vs-nested split as D21(b) (features nest under `src/features/<f>/tests/`, since D24 explicitly places harness specs there; only `common`'s tests are top-level, per its own pre-phase precedent above — a later phase should re-confirm this if it looks inconsistent when it gets there, rather than assuming).

### Recipe split executed in phase 02

`06-editor`, `15-cmdline`, `18-split`, `19-choose-tree` (the 4 recipes this map already assigned to phase 02, minus the two flagged-ambiguous ones — `08-tracker` and `17-host-shell` stayed in `legacy`/`tests/visual/identical.spec.ts`, deliberately, per their flag notes above: phase 02 does not resolve those flags itself) moved out of `tests/visual/identical.spec.ts`'s `keyRecipes` (now filtered by a `COMMON_OWNED_RECIPE_NAMES` set) into a new `common/tests/ui/visual/identical.spec.ts`, run by the `common-visual-<viewport>` projects. `tests/visual/adversarial-fixtures.spec.ts` was not touched — it covers employment/repositories fixtures, not common.

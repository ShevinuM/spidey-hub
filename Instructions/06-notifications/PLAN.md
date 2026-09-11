# Phase 06 — notifications

> **Status: planned, not started. Blocked on phase 05.** Binding decisions: `Instructions/00-phases.md` (the only cross-phase document this plan may read). This plan is self-contained: every mechanism it needs is stated here verbatim, so the executor never reads another phase's folder.

## Context

**`src/features/notifications`.** Everything below is scoped to it except the declared out-of-context wiring.

**Declared out-of-context wiring** (mechanical only — D24's closing clause; no behavioral edits outside the context, ever):

| file | why |
|---|---|
| `playwright.config.ts` | three project entries (§Mechanics 3) |
| `package.json` | `test:e2e` / `test:visual` explicit lists |
| `src/content.config.ts` | `notifications` collection `base:` pointer (D22) |
| `src/common/lib/data.ts` | `notifications.yaml` `?raw` import re-point (D17) |
| `src/pages/harness/[feature].astro` | one `notifications` branch (D24) |
| `src/bootstrap/Terminal.svelte:53` | import path for `Notifications.svelte` |
| `common/tests/ui/support/fixtures.ts:41` | import path for the two storage keys |
| `common/tests/ui/e2e/animations.spec.ts:27` | same two storage keys — **second importer, easy to miss** |
| `common/tests/ui/support/pipeline.mjs:43` | import path for `TOAST_SEED_STORAGE_KEY` |
| `src/components/repositories/repositoriesState.svelte.ts:24` | import path for `agoLabel` (ruling R2 below) |
| `tests/visual/identical.spec.ts` | `SPLIT_OWNED_RECIPE_NAMES` gains `21-notifications-panel-open` |
| `docs/testing/{e2e,visual}/running-tests.md` | project rows (doc-practice, same commit) |
| `tests/visual/goldens/<vp>/21-notifications-panel-open.png` | deleted after the copy is verified |

## Objective

The bell/panel/toast system lives in `src/features/notifications/`, moved verbatim, with all three e2e specs, the unit test, and the `21-notifications-panel-open` golden green at both viewports and zero golden churn; a `notifications-harness` route mounts the system with no Terminal kernel.

## Background — verified inventory

Every path below was verified on disk. **Do not re-derive; do verify before editing.**

### Move table

| from | to | lines |
|---|---|---|
| `src/components/notifications/Notifications.svelte` | `src/features/notifications/components/Notifications.svelte` | 74 |
| `src/components/notifications/NotificationBell.svelte` | `…/components/NotificationBell.svelte` | 77 |
| `src/components/notifications/NotificationsPanel.svelte` | `…/components/NotificationsPanel.svelte` | 242 |
| `src/components/notifications/ToastStack.svelte` | `…/components/ToastStack.svelte` | 147 |
| `src/components/notifications/notificationsState.svelte.ts` | `…/components/notificationsState.svelte.ts` (D15: state classes keep `<name>State.svelte.ts`) | 262 |
| `src/lib/notificationStore.ts` | `src/features/notifications/lib/notification-store.ts` (D15 kebab-case) | 431 |
| `src/lib/notifications.ts` | `src/features/notifications/lib/toast-seed.ts` (ruling R1) | 10 |
| `src/content/notifications/` (30 `.md`) | `src/features/notifications/content/` — one file per record stays (files-and-naming R013) | 30 files |
| `src/data/notifications.yaml` | `src/features/notifications/content/notifications.yaml` | 42 |
| `tests/e2e/notifications.spec.ts` | `src/features/notifications/tests/ui/e2e/notifications.spec.ts` | 447 |
| `tests/e2e/notifications-boot.spec.ts` | `…/tests/ui/e2e/notifications-boot.spec.ts` | 124 |
| `tests/e2e/toast-drain-arm.spec.ts` | `…/tests/ui/e2e/toast-drain-arm.spec.ts` | 199 |
| `tests/unit/notificationStore.test.ts` | `src/features/notifications/tests/unit/notification-store.test.ts` (D15) | 416 |
| `tests/visual/goldens/<vp>/21-notifications-panel-open.png` | `src/features/notifications/tests/ui/visual/goldens/<vp>/` | 2 files |

`src/components/notifications/` holds exactly those five files and nothing else — the directory is deleted when empty.

### Orchestrator rulings (do not re-litigate — architecture R003)

- **R1 — `src/lib/notifications.ts` ports; it is NOT dead.** The plan's earlier "zero consumers → delete" branch was wrong: `common/tests/ui/support/pipeline.mjs:43` imports `TOAST_SEED_STORAGE_KEY` from it and uses it at lines 126 and 310 to pre-seed sessionStorage for **every visual-golden capture**. Deleting it breaks the capture pipeline. It moves to `lib/toast-seed.ts` — D15 sanctions renames during moves, the file's entire content is that one constant, and `features/notifications/lib/notifications.ts` would be a redundant path. Its header comment points at a nonexistent `tests/visual/pipeline.mjs`; correct it to the real `common/tests/ui/support/pipeline.mjs` in the same change (precedent: commit `57287a1`).
- **R2 — `agoLabel` stays inside `notification-store.ts`; repositories gets a path-only update.** `src/components/repositories/repositoriesState.svelte.ts:24` imports `agoLabel`. D16's rule-of-three governs **modules**, not functions inside a module — promoting `agoLabel` means splitting a 431-line module that is being moved verbatim, which is exactly the rewrite the move-don't-rewrite stop conditions forbid (contrast phase 04's `docline.ts`, a whole module with 3 consumers). The import is path-updated only. The resulting legacy→feature edge is recorded in this phase's audit report as a **D23(c)** exemption: the violation lands in the transient legacy tree (`src/components/repositories/`), not in this phase's context, and the dependency direction pre-existed the move. Phase 09 decides whether a date-formatting module promotes to `common/lib/` once repositories sits in its real context. **Do not create a re-export shim or a stub** — a path update is the whole fix.
- **R3 — no fixture switch.** D7's fixture-split mapping names only repositories, employment, dashboard, grep and shell-fs. Notifications is absent, so `content.config.ts` gets a plain `base:` re-point with **no** `useFixtures` ternary and `build:fixtures` gains **no** new `cp` clause. (Fixture-mode notification state is built at request time by `buildNotifications` in `src/common/lib/data.ts` via `PORTFOLIO_FIXTURES`, not from a static fixture JSON.)
- **R4 — no library-swap step.** Nothing in `00-phases.md` gives this phase an analog of phase 04's D11 fuzzysort step. This is the 5-step loop plus the harness, and nothing else.

### Single-source-of-truth constraint (the stop condition that matters most)

All three specs and the unit test import seed/timing logic **directly from the store** — there are no duplicated constants today, and none may be introduced:

- `tests/e2e/notifications.spec.ts:13` — `import { mulberry32, pickRandomUnseen, TOAST_DURATION_MS, type NotificationSeverity, type PoolEntry } from "../../src/lib/notificationStore.ts";`
- `tests/e2e/toast-drain-arm.spec.ts:34` — `import { TOAST_DURATION_MS, type NotificationSeverity } from "../../src/lib/notificationStore.ts";`
- `tests/e2e/notifications-boot.spec.ts:20` — `import { TOAST_DURATION_MS } from "../../src/lib/notificationStore.ts";`
- `tests/unit/notificationStore.test.ts:31` — a 20-symbol named import from `"../../src/lib/notificationStore"`

All four break on the move (path **and** filename change). Each is repointed; none is replaced by a literal.

### Fixture-vs-raw import split (port behavior untouched)

- `notifications.spec.ts:12` uses the **shared fixture**: `import { expect, test, E2E_NOTIFICATIONS_INJECT_SEED, E2E_TOAST_DURATION_SCALE, type Page } from "../../common/tests/ui/support/fixtures.ts";` (plus `readContentDir` from `content-fixtures.ts:14`).
- `notifications-boot.spec.ts:19` and `toast-drain-arm.spec.ts:32` use **raw `@playwright/test`** deliberately. Preserve that — do not "normalize" them onto the shared fixture.

### Other verified facts

- Golden `21-notifications-panel-open` exists at `tests/visual/goldens/{1512x945,1920x1080}/`, reached by the `n` key. Confirm which exported array in `common/tests/ui/support/recipes.ts` owns it before writing the filter set — phase 04 found a feature's recipes split across two arrays, so **check, don't assume one**.
- `src/data/notifications.yaml` is 42 lines, a single `ui:` block; the pool lives in the content collection.
- `src/content.config.ts` lines 160–172 define the `notifications` collection (`base: "src/content/notifications"`), registered at line 196.
- `src/common/lib/data.ts` exposes `buildNotificationPool` (line 149) and `buildNotifications` (line 195); all six page files call `buildNotifications(await getCollection("notifications"))` and pass it into `<Terminal>`. **Pages are not edited by this phase** — only the `base:` pointer and the `?raw` yaml path move beneath them.
- `vitest.config.ts` already globs `src/features/*/tests/unit/**/*.test.ts`. **No `vitest.config.ts` change is needed.**
- v1 drift: **none.** `notificationStore.ts`, `notifications.ts`, `notifications.yaml`, `src/content/notifications/`, `notifications-boot.spec.ts` and `toast-drain-arm.spec.ts` are byte-identical to v1's working tree; the remaining files differ only by path rewrites already applied in earlier phases.

## Mechanics (settled by phases 02–04; reuse verbatim, do not redesign — architecture R003)

**1. D21(a) snapshot paths.** The root `snapshotPathTemplate` stays `"tests/visual/goldens/{projectName}/{arg}{ext}"`. Every split visual project carries its **own** template with the viewport as a **literal**, never `{projectName}`.

**2. Project naming.** A Playwright project is 1:1 with one `use` config, so each tier emits **two** entries via `viewports.map(...)`. **There is no bare alias and no glob** — `--project=notifications` and `--project="*-visual"` both error. Always the two explicit flags.

**3. The three project entries this phase adds** to `playwright.config.ts`, appended after the `help-harness` entry:

```ts
...viewports.map((viewport) => ({
  name: `notifications-${viewport.name}`,
  testDir: "./src/features/notifications/tests/ui/e2e",
  use: { ...devices["Desktop Chrome"], viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 },
})),
...viewports.map((viewport) => ({
  name: `notifications-visual-${viewport.name}`,
  testDir: "./src/features/notifications/tests/ui/visual",
  snapshotPathTemplate: `src/features/notifications/tests/ui/visual/goldens/${viewport.name}/{arg}{ext}`,
  use: { ...devices["Desktop Chrome"], viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 },
})),
{
  name: "notifications-harness",
  testDir: "./src/features/notifications/tests/ui/harness",
  use: { ...devices["Desktop Chrome"], viewport: { width: viewports[0].width, height: viewports[0].height }, deviceScaleFactor: 1 },
},
```

**4. D24 harness route.** `src/pages/harness/[feature].astro` is one shared dynamic route gated by `if (process.env.PORTFOLIO_FIXTURES !== "1") return [];` in `getStaticPaths`. Add a `notifications` entry to (a) the `getStaticPaths` array, (b) a `const notifications = feature === "notifications" ? … : undefined` line, (c) a conditional block in the template. Because notifications has an orchestrator component (`Notifications.svelte`), prefer mounting it directly; add a harness-only wrapper at `src/features/notifications/tests/ui/harness/NotificationsHarness.svelte` **only** if cross-component routing that `Terminal.svelte` normally owns is actually needed.

**5. Harness hydration race — required.** Whenever the harness ships `client:load`, the server-rendered HTML exists before hydration, so a spec that waits on a content locator races the listener attaching. Render an `onMount`-flipped element and wait on **that**:

```svelte
<div data-testid="notifications-harness-ready" data-ready={ready}></div>
```

**6. Page objects.** `src/features/notifications/tests/ui/pages/NotificationsPage.ts`, a sibling of `e2e/`/`visual/`/`harness/`. A feature page object **may not** redefine kernel-chrome locators — compose the shared class:

```ts
import { StatusBarPage } from "../../../../../../common/tests/ui/pages/StatusBarPage";
```

Verify that relative depth with `node -e "…path.relative…"`; do not guess it.

**7. Locators.** `playwright.md` R002 bans CSS selectors unconditionally, even scoped off a resolved testid. If a repeated element needs narrowing, add a real `data-testid` to the markup (attribute-only, zero pixel change, goldens re-verified in the same change — D24's sanctioned mechanical edit).

**8. Per-commit index self-consistency (toolchain R012).** If this phase's edits span multiple commits, run `pnpm generate` **per commit against that commit's own tree** (stash uncommitted files first) and diff `public/generated/{grep-index,fs-index}.json` **programmatically** — both are single-line JSON, so `git diff` alone is useless. Revert unrelated live-data drift (`contributions.json`, `commits/daily-tech-digest.json`, `file-icons.json`) with `git checkout --` before committing. Note `scripts/generate.mjs` walks only `["src","scripts","tests"]`, so files under `common/tests/` legitimately drop out of both indexes.

## Steps

- [ ] **1. Port specs + goldens.**
  `git mv` the three specs into `src/features/notifications/tests/ui/e2e/`. Repoint `fixtures`/`content-fixtures` imports to `../../../../../../common/tests/ui/support/{fixtures,content-fixtures}` — **extensionless** (D23(d): a feature phase's spec-port step MUST strip `.ts`) — after verifying the depth with `path.relative`. Fix each spec's `ROOT = join(import.meta.dirname, …)` constant to the new depth. Leave the store imports pointing at `src/lib/notificationStore.ts` for now (step 2 moves the module); they must be green at the end of step 2, not this one.
  Create `src/features/notifications/tests/ui/visual/identical.spec.ts`, modeled on `common/tests/ui/visual/identical.spec.ts`'s shape, importing whichever recipe array(s) own `21-notifications-panel-open` and filtering to a `NOTIFICATIONS_OWNED_RECIPE_NAMES` set.
  `cp` both goldens into `src/features/notifications/tests/ui/visual/goldens/<vp>/`; `cmp` each against the pre-move copy **and** against v1's copy at `/Users/shev/Development/spidey-hub/tests/visual/goldens/`; then delete the originals from `tests/visual/goldens/`. Add the recipe name to `tests/visual/identical.spec.ts`'s `SPLIT_OWNED_RECIPE_NAMES` and update its header comment.
  **`notifications-boot.spec.ts` and `toast-drain-arm.spec.ts` also import `BOOT_SEEN_STORAGE_KEY`** — after phase 05 that resolves to `src/features/boot/lib/boot-state`, and relocating these specs re-depths it. Fix it explicitly (`path.relative`-verified) alongside the store imports; do not rely on a generic sweep. The resulting notifications-tests → boot-lib edge is a verbatim-ported spec's import and is recorded for the auditor under **D23(a)**.
  Add the three project entries (§Mechanics 3); extend `package.json`'s `test:e2e` with `--project=notifications-1512x945 --project=notifications-1920x1080` and `test:visual` with the new `identical.spec.ts` path **only**. The harness spec path is added in step 6, when the spec exists — Playwright exits 1 on a path that resolves to no tests, so adding it here reds this step's own gate. (The `notifications-harness` *project entry* is fine to add now; an empty `testDir` is not an error, an unmatched spec path is.) Sweep `docs/testing/{e2e,visual}/running-tests.md` in this same commit — read the existing `profile`/`help` rows and match their format exactly; **verify every project name against real `playwright test --list` output before writing any row** (phase 03 shipped fabricated bare-alias rows twice).
  *Verify:* `pnpm build` then `E2E_EXPECT_FIXTURES=0 playwright test --project=smoke --project=legacy-1512x945 --project=legacy-1920x1080 --project=common-1512x945 --project=common-1920x1080 --project=profile-1512x945 --project=profile-1920x1080 --project=help-1512x945 --project=help-1920x1080 --project=boot-1512x945 --project=boot-1920x1080 --project=notifications-1512x945 --project=notifications-1920x1080` → all green. Then `pnpm build:fixtures` and the `test:visual` spec list including the new `identical.spec.ts` → all green. `playwright test --list` names all three new projects.

- [ ] **2. Move source; update every importer; delete originals.**
  `git mv` all five component files, `notificationStore.ts` → `lib/notification-store.ts`, `notifications.ts` → `lib/toast-seed.ts` (R1, including its stale-comment fix), the 30 content docs, and `notifications.yaml`.
  Repoint **every** importer listed in §Context's wiring table plus the four test imports in §Background. The two easily-missed ones are `common/tests/ui/e2e/animations.spec.ts:27` and `common/tests/ui/support/pipeline.mjs:43`. `pipeline.mjs` runs under bare Node, so its import **keeps** its explicit `.ts` extension (D23(d): not a violation — Node's ESM resolver requires it).
  Update `content.config.ts`'s `base:` to `src/features/notifications/content` (no fixture switch — R3) and `src/common/lib/data.ts`'s `?raw` yaml import.
  Apply R2 to `repositoriesState.svelte.ts:24` — path only.
  **D8 literal-path assertion — mandatory, in this same change:** `notifications.spec.ts:30` reads `const entries = readContentDir<NotificationFrontmatter>(join(ROOT, "src/content/notifications"));`. `readContentDir` does a real `readdirSync` of that directory, so moving the 30 docs makes it throw. Update the literal to the new content path and fix the doc-comment above it (line 25) that cites `src/content/...` too. This is D8's sanctioned same-change update — **not** a behavior change, and explicitly permitted by the stop conditions below.
  `pnpm generate`; diff both indexes programmatically.
  *Verify:*
  ```bash
  test ! -d src/components/notifications
  test ! -e src/lib/notificationStore.ts && test ! -e src/lib/notifications.ts
  test ! -d src/content/notifications && test ! -e src/data/notifications.yaml
  grep -rn "lib/notificationStore\|lib/notifications\b\|components/notifications" src tests common scripts
  ```
  The grep must return **only** intentionally-updated lines — no stale residue. Record every legacy→feature edge in Results for the auditor, naming the D23(c) exemption.

- [ ] **3. Full gate, from the clean committed tree.** Not folded into step 2's commit.
  *Verify:* `pnpm check` → 0 errors. `pnpm lint` → exit 0. `pnpm test:unit` → count unchanged from before this phase. D20 (a) real build → every project above green. D20 (b) fixture build → every `*-visual` + legacy visual + the **three existing** harness specs (`profile`, `help`, `boot`) green. Notifications' own harness does not exist yet — it lands in step 6 and is gated there. `public/generated/*` unchanged by this step. These runs auto-background past the 120s foreground default — monitor to completion, never sleep-poll.

- [ ] **4. Golden parity — zero churn.**
  *Verify:* `diff -rq tests/visual/goldens /Users/shev/Development/spidey-hub/tests/visual/goldens` shows **only** `Only in …` lines for every recipe split out by phases 02–06 — never a `differ` line. `cmp` each of this phase's two goldens against v1's byte-for-byte. Total PNGs stay 21 recipes × 2 viewports = 42, redistributed. **No `--update-snapshots`, ever (D5).**

- [ ] **5. Move the unit test.**
  `git mv tests/unit/notificationStore.test.ts src/features/notifications/tests/unit/notification-store.test.ts`; fix its 20-symbol import to the new location.
  *Verify:* `pnpm test:unit` → same N/N passed, same M/M files as before (pure relocation).

- [ ] **6. Feature harness (D24).**
  Add the `notifications` branch to `src/pages/harness/[feature].astro` (§Mechanics 4), the ready-element (§Mechanics 5), and specs at `src/features/notifications/tests/ui/harness/notifications.spec.ts` asserting mount plus the system's core interactions — bell badge, panel open via `n`, toast appearance/dismiss. Assert kernel-free isolation via the composed `StatusBarPage`: `expect(page.statusBar.windows).toHaveCount(0)`. No goldens (D24(b)).
  Now that the spec exists, append its path to `package.json`'s `test:visual` (deferred from step 1).
  *Verify:* fixture build → `--project=notifications-harness` green, and `pnpm test:visual` green as a whole with the new path in it. Real build → `test ! -d dist/harness` **and** `grep -rl "NotificationsHarness" dist --include="*.html"` empty. A bare `find dist -iname "*harness*"` will still match a dead ~1 KB JS chunk if a wrapper component was used — that is expected and ruled harmless (`00-phases.md`, Deferred), **not** a failure.

- [ ] **7. Record and close.** First run the plan-citation sweep over this phase's own context — `grep -rniE "plan\.md|phase [0-9]|defect [0-9]|\b[fg][0-9]+\b" src/features/notifications` — and rewrite any hit in the file's own terms (comment text only; a ported spec's logic is untouchable). v1's specs cite v1 planning docs that do not exist here, which comments.md R008 forbids; phase 05 hit this twice and the second instance cost a whole extra fix round. Catch it before the auditor does.
  Then fill in Results: every file moved, every importer updated, the D16/D23 edges flagged for the auditor, gate outputs, and which harness shape was used. Commit to `frontend-rewrite` — single-line imperative, **no body, no trailer** (toolchain R011), one reviewable unit per commit (R012).

## Acceptance criteria

1. Every file in the move table is at its new path; `src/components/notifications/`, `src/lib/notificationStore.ts`, `src/lib/notifications.ts`, `src/content/notifications/` and `src/data/notifications.yaml` no longer exist.
2. No duplicated seed/timing constants — all four test files import from the moved store.
3. `pnpm check` 0 errors, `pnpm lint` 0 findings, `pnpm test:unit` count unchanged.
4. D20 both invocations green, including `notifications-{1512x945,1920x1080}`, `notifications-visual-*`, and `notifications-harness`.
5. Zero golden churn; 42 PNGs total; `21-notifications-panel-open` byte-identical to v1 at both viewports.
6. Real build emits no `dist/harness/` directory and no HTML reference to a harness component.
7. Verifier PASS **and** auditor clean on `src/features/notifications` (D23 exemptions recorded with the exemption named).
8. Results filled in; no `(executor fills in)` placeholder.

## Stop conditions

- **No behavior changes.** No toast-timing, seed-logic, or notification-ordering edits. The specs derive expected values from `mulberry32`/`pickRandomUnseen` — if a spec goes red on *logic*, the move is wrong, not the spec. **This does not forbid D8 path updates:** repointing an import or a literal filesystem path a move invalidated (e.g. `notifications.spec.ts:30`) is required, not a spec rewrite. The line is behavior vs. location — change locations freely, never expectations.
- **No rewriting moved code** — no splitting `notification-store.ts`, no extracting `agoLabel` (R2), no normalizing the two raw-`@playwright/test` specs onto the shared fixture.
- **No golden regeneration**, no `--update-snapshots`.
- **No behavioral edits outside the context** — path updates only.
- If a step turns out to rest on a false assumption, **stop and report** rather than redesigning; the orchestrator updates this plan.

## Results

(executor fills in)

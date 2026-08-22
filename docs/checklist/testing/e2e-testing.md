# e2e testing

What belongs in the e2e suite, and how a spec/page object is organized. Playwright-tool mechanics (locator API, web-first assertions, `test.extend`) live in `../tech-stack/playwright.md` — this file covers testing strategy: what earns an e2e spec, the page-object structure, and this repo's own behavioral assertion rules.

## What belongs here

- [ ] **R001** An e2e spec exists only for user-observable flow that genuinely needs a real browser — if what it asserts could be proven by a unit test on the underlying `lib`/state-class logic instead, write that test and skip the e2e spec.
- [ ] **R002** An e2e spec proves a flow works — click, type, navigate, observe the resulting state. It never exists just to reach a screen for a screenshot; reaching a state to compare pixels is `visual-testing.md`'s job, not e2e's.

## Page objects

- [ ] **R003** All locators and page interactions live inside a page-object class — a spec calls page-object methods, never `page.locator(...)` directly.
- [ ] **R004** Locators are exposed as getters, not fields, so they resolve lazily on access rather than being captured once at construction time (before the element may even exist).
- [ ] **R005** A UI piece shared across features (the kernel chrome — `StatusBar`, `PaneTree`, `Cmdline`) gets its own shared page-object class living in `common/tests/ui/pages/`, composed as a property into each feature's page object — never redefined per feature.
- [ ] **R006** Action methods are atomic — one logical interaction per method (`openRepo(name)`, `submitSearch(query)`), never a combined multi-step method that hides what actually happened when a test fails partway through it.
- [ ] **R007** Assertions live in the spec, not the page object. The one exception is a convenience method whose name states the expected outcome (`expectRepoOpened(name)`) — its whole job is that assertion, so folding it into the page object doesn't hide anything.
- [ ] **R008** No "god" page object — a class approaching a few dozen methods splits into smaller component classes (mirroring the panel split a feature's own components already have, e.g. one page-object class per panel in `repositories`).

## Naming & file placement

- [ ] **R009** Page-object files are PascalCase (`RepositoriesPage.ts`); locator getters are camelCase (`repoRow`, `filesPanel`); action methods are verb-based camelCase (`openRepo`, `expandTree`); spec files are kebab-case (`repositories.spec.ts`) — matching the naming already used across the repo.
- [ ] **R010** A feature's e2e specs live inside that feature's own `tests/ui/e2e/` folder, and its page objects live in `tests/ui/pages/` — a sibling of `e2e/` and `visual/`, not nested inside either, since a page object serves both suites — never in a shared top-level `tests/` tree a change to one feature has to search through. Page objects for kernel/shared chrome live under `common/tests/ui/pages/` instead.
- [ ] **R011** Feature-specific test data (seed content, expected strings) lives beside the specs that use it, in that feature's own `tests/ui/support/` — not a shared top-level `data/` folder, unless two or more features genuinely need the same data. This folder is shared by e2e and visual specs for the same reason `pages/` is (R010) — the data isn't e2e-specific.

## Behavioral assertions specific to this codebase

- [ ] **R012** Never verify a CSS animation is actually running with `getComputedStyle(el).animationName` — it returns the declared name whether or not that name resolves to a real keyframes rule. Assert `el.getAnimations().length > 0`, or match the name against `document.styleSheets` for a real `CSSKeyframesRule`. This is an e2e-only technique — the visual suite freezes animations at capture time and never asserts on them running.
- [ ] **R013** A new scrollable/overflowable panel ships with an overflow/scrollability assertion (`overflowY`/`overflowX`, `scrollHeight > clientHeight`, a wheel/keyboard scroll actually moving `scrollTop`) — this requires real interaction, so it's an e2e check, not a visual one.
- [ ] **R014** A new feature interacting with boot or first-visit state ships with at least one non-fixture, cold-boot e2e check that opts out of any shared "already seen" fixture shortcut.

## Isolation

- [ ] **R015** No shared state between tests — each test builds its own state via its page object/fixtures and never depends on state a previous test happened to leave behind. Tests are short and focused: one flow per test, no hardcoded values that belong in fixture data instead.

## Smoke tier & Playwright projects

- [ ] **R016** A root-level smoke tier lives in `tests/ui/smoke/` (grouped under `ui/` alongside every other Playwright-driven suite, distinct from `tests/audits/`'s non-browser fitness checks) and holds broad, shallow, whole-app health checks (every route loads with no console error, the terminal boots, navigation between features works) — never a feature-specific behavioral assertion. It's the pre-merge gate: cheap enough to run on every PR regardless of what changed. A spec that needs real depth on one feature's behavior belongs in that feature's own `tests/ui/e2e/`, not here.
- [ ] **R017** Every tier (`smoke`, and one per feature) is a Playwright `project` entry in a single root `playwright.config.ts`, scoped by `testDir`/`testMatch` to that tier's folder — not a separate config file or pipeline per tier. This is the actual mechanism behind `../testing/README.md` R001's per-feature test folders: `playwright test --project=<feature>` runs only that feature, `--project=smoke` runs only the cross-feature checks.

# e2e test suite structure

How e2e/visual test code is organized across the bounded-context rewrite, and how that maps onto Playwright's own `projects` mechanism. The checkable rules this doc explains live in `../checklist/testing/e2e-testing.md`, `../checklist/testing/visual-testing.md`, and `../checklist/tech-stack/playwright.md`; on any disagreement between this doc and the checklist, fix both in the same change rather than trusting one over the other.

## Folder structure

```
src/
  features/
    <feature>/
      tests/
        unit/                  Vitest, pure lib/state-class logic — no browser
        ui/                    everything Playwright-driven — grouped because both
                                suites below need a browser and share page objects
          e2e/
            <feature>.spec.ts  behavioral specs for this feature only
          visual/
            <feature>.visual.spec.ts
            goldens/
          pages/               this feature's page object(s) — shared by e2e AND visual,
            <Feature>Page.ts   so it's a sibling of both, not nested inside e2e/
          support/             feature-local fixtures/test data, shared by both suites
  common/
    tests/
      ui/
        pages/                 shared kernel-chrome page objects (e.g. StatusBarPage.ts),
                                composed into each feature's page object
tests/                         root-level, cross-feature
  ui/
    smoke/                     broad, shallow, whole-app health checks — the pre-merge
                                gate; grouped under ui/ because it's Playwright-driven too
  audits/                      coverage audit + boundary fitness tests (no-feature-imports-
                                feature, etc.) — NOT under ui/, since these aren't browser tests
playwright.config.ts           root config — see "Playwright projects" below
```

`ui/` groups the two Playwright-driven suites (and root smoke) apart from `unit/`, which needs no browser at all. This is a folder-organization decision only — it does **not** mean e2e and visual run as one Playwright project; see the table below for why they stay separate projects despite living under the same parent folder.

## Playwright projects — the tier mechanism

There is one root `playwright.config.ts`, and every tier is a Playwright `project` entry in it rather than a separate folder-based pipeline. Folder grouping (`tests/ui/`) and project grouping (the `projects` array) are independent — e2e and visual sit under the same `ui/` parent but stay separate projects because they run against different builds and different `use` options:

| project | scope | what it's for |
|---|---|---|
| `smoke` | `tests/ui/smoke/**` | Fast, shallow, cross-feature checks (every route loads with no console error, the terminal boots, navigation between features works). Runs on every PR — the pre-merge gate. |
| `<feature>` (one per feature) | `src/features/<feature>/tests/ui/e2e/**` | The thorough tier for that feature's own behavior, against the real build. There's no separate "acceptance" tier, because a feature project already scopes depth by feature rather than by an arbitrary shallow/deep split. |
| `<feature>-visual` (one per feature) | `src/features/<feature>/tests/ui/visual/**` | Golden pixel comparison against the fixture build, with `animations: "disabled"` — a project-wide `use` option the e2e project doesn't set. |

Running `pnpm exec playwright test --project=repositories` runs only that feature's e2e specs; `--project=smoke` runs only the cross-feature health checks. This is the actual mechanism behind `../checklist/testing/README.md`'s "each feature's tests live inside its own folder" rule — the projects array is what turns that folder layout into independently runnable suites.

The tier decision when adding a new spec: *is this deep, feature-specific behavior?* → the feature's own `tests/ui/e2e/`. *Is this a broad, whole-app check cheap enough to run on every single PR regardless of what changed?* → root `tests/ui/smoke/`.

## `tests/ui/pages/` — page object model (POM)

Each feature's page-object classes represent that feature's screens/panels, and live as a sibling of `e2e/`/`visual/` — not nested inside either — because both suites reach states through the same page object. All locators and interactions live here, centralized in one place — see `page-object-model.md` for the full convention and `locator-preference.md` for how a locator is chosen:

```ts
class RepositoriesPage {
  constructor(private readonly page: Page) {}

  get repoRow() {
    return (name: string) => this.page.getByTestId('repositories-repo-row').filter({ hasText: name });
  }

  async openRepo(name: string) {
    await this.repoRow(name).click();
  }
}
```

## `common/tests/ui/pages/` — shared page objects

UI pieces reused across features — the kernel chrome (status bar, shared overlays) — get their own page-object class here rather than being redefined per feature. A feature's own page object composes the shared one as a property instead of duplicating its locators.

## `tests/ui/support/` (per feature) — fixtures & test data

Fixtures power shared per-feature setup (seeding a fixture build, navigating to a common starting view), and this folder is shared by e2e and visual specs for the same reason `pages/` is — the setup isn't e2e-specific:

```ts
export const test = base.extend<{ repositoriesPage: RepositoriesPage }>({
  repositoriesPage: async ({ page }, use) => {
    await page.goto('/repositories');
    await use(new RepositoriesPage(page));
  },
});
```

Feature-specific test data (expected strings, seed content) lives beside the specs that use it, in that same `tests/ui/support/` folder — not a shared top-level `data/` folder, unless two or more features genuinely need the same data.

## `tests/ui/smoke/` and `tests/audits/` — root-level

`tests/ui/smoke/` holds the cross-feature health checks described above — grouped under `ui/` because it's Playwright-driven like every feature's e2e/visual suites. `tests/audits/` holds the coverage audit (does every feature have the unit/e2e/visual tests its manifest declares) and the architecture boundary fitness tests (no-feature-imports-feature, no-common-imports-feature, etc.) — these aren't browser tests, so they stay outside `ui/` — see `../checklist/testing/README.md` for both.

## Best practices

- Keep test assertions in specs, not page objects (exception: a convenience method whose name states its own assertion).
- Write short, focused tests — one flow per test.
- Avoid hardcoded values — use feature-local test data.
- Minimize manual waits — Playwright auto-waits by default; see `../checklist/tech-stack/playwright.md` for the exact rules on web-first assertions and when a wait is ever justified.
- No shared state between tests — each test builds its own state via its page object and fixtures.
